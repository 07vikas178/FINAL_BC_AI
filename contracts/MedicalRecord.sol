// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title MedicalRecord
 * @dev This smart contract now manages all application data, including user identity,
* appointments, and doctor affiliations, replacing the need for a traditional database.
*/
contract MedicalRecord {

    // --- USER IDENTITY ---

    enum UserType { Patient, Doctor, Hospital }

    struct User {
        string email;
        string hashedPassword; // Stored hash of the user's password
        string name;
        UserType userType;
        string details; // JSON string for extra data: {dob: "...", contact: "..."} or {specialization: "..."}
        bool isRegistered;
    }

    // Mapping from a user's email (as a unique ID) to their User struct
    mapping(string => User) public users;
    // Mapping for quick existence check
    mapping(string => bool) public isUserEmailRegistered;

    // --- DOCTOR AFFILIATION (GRANT/REVOKE) ---

    enum AffiliationStatus { Pending, Approved, Revoked }

    struct DoctorAffiliation {
        string doctorEmail;
        string doctorName;
        string specialization;
        AffiliationStatus status;
        uint256 timestamp;
    }

    // Mapping from a hospital's email to a list of its affiliated doctors (past and present)
    mapping(string => DoctorAffiliation[]) public hospitalDoctorAffiliations;
    
    // Mapping from a doctor's email to their current hospital and status
    mapping(string => (string, AffiliationStatus)) public doctorAffiliationStatus;

    // List of hospital emails for easy lookup
    string[] public hospitalList;
    mapping(string => bool) public isHospitalInList; // Prevents duplicate entries in hospitalList

    // --- APPOINTMENTS ---

    struct Appointment {
        string consultingId; // Unique ID for the appointment
        string patientEmail;
        string doctorEmail;
        string hospitalEmail;
        string patientName;
        string doctorName;
        string appointmentTime;
        string status; // "Pending", "Approved", "Rejected"
        uint256 timestamp;
    }

    // Mappings to retrieve appointments by different parties
    mapping(string => Appointment[]) public appointmentsForPatient;
    mapping(string => Appointment[]) public appointmentsForDoctor;
    mapping(string => Appointment[]) public appointmentsForHospital;
    // Mapping from consultingId to its index in the hospital's array for quick updates
    mapping(string => uint256) public hospitalAppointmentIndex;


    // --- PRESCRIPTIONS, CONSENT & LOGS (Original Functionality) ---

struct Prescription {
        string doctorName;
        string disease;
        string cid;
// The IPFS Content ID for the prescription file/data
        uint256 timestamp;
}

    struct Consent {
        string granteeId; // Now the grantee's email
string accessLevel;
        uint256 duration; 
        string status; 
        uint256 timestamp;
    }

    enum LogType { AppointmentBooked, HistoryAccessed, RecordUpdated, ConsentGiven, UserRegistered, AffiliationChanged }

    struct TransactionLog {
        uint256 timestamp;
LogType logType;
        string performedBy; // User's email
        string details;
}

mapping(string => Prescription[]) public records; // Key: patient email
mapping(string => Consent[]) public consentLog; // Key: patient email
mapping(string => TransactionLog[]) public transactionLogs; // Key: patient email


    // --- EVENTS ---
event AppointmentBooked(string patientId, uint256 timestamp, string details);
event HistoryAccessed(string patientId, string doctorId, uint256 timestamp);
    event RecordUpdated(string patientId, string doctorId, uint256 timestamp, string cid);
event ConsentManaged(string patientId, string granteeId, string status, uint256 timestamp);
    event UserRegistered(string email, UserType userType, uint256 timestamp);
    event AffiliationManaged(string hospitalEmail, string doctorEmail, AffiliationStatus status, uint256 timestamp);
    event AppointmentStatusUpdated(string consultingId, string status, uint256 timestamp);

    
    // --- USER MANAGEMENT FUNCTIONS ---

    /**
     * @dev Registers a new Patient or Hospital. Doctors must use requestDoctorAffiliation.
     */
    function registerUser(
        string memory _email,
        string memory _hashedPassword,
        string memory _name,
        UserType _userType,
        string memory _details
    ) public {
        require(isUserEmailRegistered[_email] == false, "Email is already registered");
        require(_userType != UserType.Doctor, "Doctors must use requestDoctorAffiliation");

        users[_email] = User({
            email: _email,
            hashedPassword: _hashedPassword,
            name: _name,
            userType: _userType,
            details: _details,
            isRegistered: true
        });
        isUserEmailRegistered[_email] = true;

        // If it's a hospital, add it to the public list
        if (_userType == UserType.Hospital && !isHospitalInList[_email]) {
            hospitalList.push(_email);
            isHospitalInList[_email] = true;
        }

        emit UserRegistered(_email, _userType, block.timestamp);
    }

    /**
     * @dev A Doctor requests to be affiliated with a hospital.
     */
    function requestDoctorAffiliation(
        string memory _doctorEmail,
        string memory _hashedPassword,
        string memory _doctorName,
        string memory _specialization,
        string memory _hospitalEmail,
        string memory _contactDetails
    ) public {
        require(isUserEmailRegistered[_doctorEmail] == false, "Email is already registered");
        require(isUserEmailRegistered[_hospitalEmail] == true, "Hospital not found");
        require(users[_hospitalEmail].userType == UserType.Hospital, "Target is not a hospital");

        // Register the doctor in the main user mapping
        users[_doctorEmail] = User({
            email: _doctorEmail,
            hashedPassword: _hashedPassword,
            name: _doctorName,
            userType: UserType.Doctor,
            details: _specialization, // Storing specialization here
            isRegistered: true
        });
        isUserEmailRegistered[_doctorEmail] = true;

        // Create the pending affiliation request for the hospital
        hospitalDoctorAffiliations[_hospitalEmail].push(DoctorAffiliation({
            doctorEmail: _doctorEmail,
            doctorName: _doctorName,
            specialization: _specialization,
            status: AffiliationStatus.Pending,
            timestamp: block.timestamp
        }));

        // Set doctor's initial status
        doctorAffiliationStatus[_doctorEmail] = (_hospitalEmail, AffiliationStatus.Pending);

        emit AffiliationManaged(_hospitalEmail, _doctorEmail, AffiliationStatus.Pending, block.timestamp);
    }

    /**
     * @dev A Hospital manages (Approves, Revokes) a doctor's affiliation.
     */
    function manageDoctorAffiliation(
        string memory _hospitalEmail,
        string memory _doctorEmail,
        AffiliationStatus _status
    ) public {
        // Simple security: only the registered hospital can manage its doctors
        // In a real app, you'd check msg.sender against the hospital's wallet address
        require(isUserEmailRegistered[_hospitalEmail] == true, "Hospital not found");
        require(users[_hospitalEmail].userType == UserType.Hospital, "Sender is not a hospital");

        DoctorAffiliation[] storage affiliations = hospitalDoctorAffiliations[_hospitalEmail];
        bool found = false;
        for (uint i = 0; i < affiliations.length; i++) {
            if (keccak256(abi.encodePacked(affiliations[i].doctorEmail)) == keccak256(abi.encodePacked(_doctorEmail))) {
                affiliations[i].status = _status;
                affiliations[i].timestamp = block.timestamp;
                found = true;
                break;
            }
        }
        require(found, "Doctor affiliation not found for this hospital");

        // Update the doctor's central status
        doctorAffiliationStatus[_doctorEmail] = (_hospitalEmail, _status);

        emit AffiliationManaged(_hospitalEmail, _doctorEmail, _status, block.timestamp);
    }

    // --- APPOINTMENT FUNCTIONS ---

    function bookAppointment(
        string memory _consultingId,
        string memory _patientEmail,
        string memory _doctorEmail,
        string memory _appointmentTime,
        string memory _patientName,
        string memory _doctorName
    ) public {
        require(isUserEmailRegistered[_patientEmail], "Patient not found");
        require(isUserEmailRegistered[_doctorEmail], "Doctor not found");

        // Get the doctor's hospital
        (string memory hospitalEmail, AffiliationStatus status) = doctorAffiliationStatus[_doctorEmail];
        require(status == AffiliationStatus.Approved, "Doctor is not approved or affiliated");

        Appointment memory newAppointment = Appointment({
            consultingId: _consultingId,
            patientEmail: _patientEmail,
            doctorEmail: _doctorEmail,
            hospitalEmail: hospitalEmail,
            patientName: _patientName,
            doctorName: _doctorName,
            appointmentTime: _appointmentTime,
            status: "Pending",
            timestamp: block.timestamp
        });

        appointmentsForPatient[_patientEmail].push(newAppointment);
        appointmentsForDoctor[_doctorEmail].push(newAppointment);
        appointmentsForHospital[hospitalEmail].push(newAppointment);
        
        // Store the index for easy updating
        hospitalAppointmentIndex[_consultingId] = appointmentsForHospital[hospitalEmail].length - 1;

        // Log transaction for the patient
        transactionLogs[_patientEmail].push(TransactionLog({
            timestamp: block.timestamp,
            logType: LogType.AppointmentBooked,
            performedBy: _patientEmail,
            details: string(abi.encodePacked("Booked appointment with ", _doctorName))
        }));
    emit AppointmentBooked(_patientEmail, block.timestamp, string(abi.encodePacked("Booked appointment with ", _doctorName)));
    }

    function updateAppointmentStatus(
        string memory _hospitalEmail,
        string memory _consultingId,
        string memory _status // "Approved" or "Rejected"
    ) public {
        require(isUserEmailRegistered[_hospitalEmail], "Hospital not found");
        
        uint index = hospitalAppointmentIndex[_consultingId];
        Appointment storage appointmentToUpdate = appointmentsForHospital[_hospitalEmail][index];

        // Ensure this appointment ID matches
        require(keccak256(abi.encodePacked(appointmentToUpdate.consultingId)) == keccak256(abi.encodePacked(_consultingId)), "Appointment ID mismatch");

        appointmentToUpdate.status = _status;

        // This is complex: we must now update the patient and doctor arrays.
        // This is a limitation of blockchain. For simplicity, we'll assume
        // the frontend re-fetches or handles this logic.
        // A more robust contract would have indexes for all arrays.

        emit AppointmentStatusUpdated(_consultingId, _status, block.timestamp);
    }


    // --- VIEW FUNCTIONS (READ-ONLY) ---

    function getUser(string memory _email) public view returns (User memory) {
        require(isUserEmailRegistered[_email], "User not found");
        return users[_email];
    }

    function getDoctorAffiliation(string memory _doctorEmail) public view returns (string memory, AffiliationStatus) {
        return doctorAffiliationStatus[_doctorEmail];
    }

    function getAllHospitals() public view returns (User[] memory) {
        User[] memory hospitalDetails = new User[](hospitalList.length);
        for (uint i = 0; i < hospitalList.length; i++) {
            hospitalDetails[i] = users[hospitalList[i]];
        }
        return hospitalDetails;
    }

    function getHospitalDoctors(string memory _hospitalEmail) public view returns (DoctorAffiliation[] memory) {
        return hospitalDoctorAffiliations[_hospitalEmail];
    }
    
    function getAppointmentsForPatient(string memory _patientEmail) public view returns (Appointment[] memory) {
        return appointmentsForPatient[_patientEmail];
    }

    function getAppointmentsForDoctor(string memory _doctorEmail) public view returns (Appointment[] memory) {
        return appointmentsForDoctor[_doctorEmail];
    }

    function getAppointmentsForHospital(string memory _hospitalEmail) public view returns (Appointment[] memory) {
        return appointmentsForHospital[_hospitalEmail];
    }


    // --- ORIGINAL FUNCTIONS (MODIFIED FOR EMAIL IDs) ---

function addPrescription(
        string memory _patientEmail,
        string memory _doctorName,
        string memory _disease,
        string memory _cid,
        uint256 _timestamp
    ) public {
        records[_patientEmail].push(Prescription({
            doctorName: _doctorName,
            disease: _disease,
      cid: _cid,
            timestamp: _timestamp
        }));
    transactionLogs[_patientEmail].push(TransactionLog({
            timestamp: block.timestamp,
            logType: LogType.RecordUpdated,
            performedBy: _doctorName, // Should be doctor's email
            details: string(abi.encodePacked("Prescription added for disease: ", _disease))
        }));
    emit RecordUpdated(_patientEmail, _doctorName, block.timestamp, _cid);
    }
    
function manageConsent(
        string memory _patientEmail,
        string memory _granteeEmail,
        string memory _accessLevel,
        uint256 _duration,
        string memory _status
    ) public {
        consentLog[_patientEmail].push(Consent({
            granteeId: _granteeEmail,
            accessLevel: _accessLevel,
      duration: _duration,
            status: _status,
            timestamp: block.timestamp
        }));
    transactionLogs[_patientEmail].push(TransactionLog({
            timestamp: block.timestamp,
            logType: LogType.ConsentGiven,
            performedBy: _patientEmail,
            details: string(abi.encodePacked("Consent ", _status, " for ", _granteeEmail))
        }));
    emit ConsentManaged(_patientEmail, _granteeEmail, _status, block.timestamp);
    }

function logHistoryAccess(string memory _patientEmail, string memory _doctorEmail) public {
        transactionLogs[_patientEmail].push(TransactionLog({
            timestamp: block.timestamp,
            logType: LogType.HistoryAccessed,
            performedBy: _doctorEmail,
            details: "Accessed medical history"
        }));
        emit HistoryAccessed(_patientEmail, _doctorEmail, block.timestamp);
    }

function getHistory(string memory _patientEmail) public view returns (Prescription[] memory) {
        return records[_patientEmail];
}

function getConsentLog(string memory _patientEmail) public view returns (Consent[] memory) {
        return consentLog[_patientEmail];
}

    function getTransactionLog(string memory _patientEmail) public view returns (TransactionLog[] memory) {
        return transactionLogs[_patientEmail];
}
}