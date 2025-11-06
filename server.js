// --- CORE DEPENDENCIES ---
const express = require('express');
// const mysql = require('mysql2'); // --- REMOVED ---
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors'); 
const { Web3 } = require('web3');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Official Google AI SDK
require('dotenv').config(); // Loads environment variables from .env file

// --- INITIALIZATIONS ---
const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE CONNECTION (REMOVED) ---
// const db = mysql.createPool({ ... }).promise(); // --- REMOVED ---

// --- IPFS & BLOCKCHAIN SETUP ---
let ipfs; // IPFS is initialized asynchronously at server startup
const web3 = new Web3('http://127.0.0.1:7545'); 

// 
// =================================================================================
// 
//   C R I T I C A L   N O T E
// 
//   YOU MUST RE-COMPILE your new 'MedicalRecord.sol' file and paste
//   the new, complete ABI (Application Binary Interface) here.
//   The ABI below is a PLACEHOLDER and WILL NOT WORK.
// 
// =================================================================================
// 
const contractABI = [
	//
	// ... PASTE YOUR NEW, COMPLETE ABI HERE ...
	//
	//   Find this in your 'contracts/artifacts/MedicalRecord.json' file
	//   after a successful compilation.
	//
    {
		"inputs": [],
		"name": "getAllHospitals",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "email",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "hashedPassword",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "enum MedicalRecord.UserType",
						"name": "userType",
						"type": "uint8"
					},
					{
						"internalType": "string",
						"name": "details",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isRegistered",
						"type": "bool"
					}
				],
				"internalType": "struct MedicalRecord.User[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	} // THIS IS JUST A SMALL, INCOMPLETE EXAMPLE! YOU MUST REPLACE THE ENTIRE ARRAY.
];
//
// =================================================================================
// 

const contractAddress = '0xF762A3E3A3E9AFC11019144e3Fbe074d356fF647'; // <-- UPDATE THIS with your new deployed contract address
const senderAddress = '0xEBeCFCAe372b55d5e4D6183b25b38C2E65D511B1'; // Your Ganache account
const privateKey = '0x9bf4db22ec810ff09b3d4766fcbe7cf7a05e186d293c1d17c63e6f8b047a6e05'; // Private key for senderAddress
const contract = new web3.eth.Contract(contractABI, contractAddress);

// --- FILE UPLOAD & JWT SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const JWT_SECRET = process.env.JWT_SECRET || 'a-very-secure-secret-key-for-jwt';

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user; // user object now contains { email, type, name }
        next();
    });
};

// --- BLOCKCHAIN TRANSACTION HELPER ---
/**
 * A helper function to estimate gas and send a signed transaction.
 * @param {object} method The web3 contract method to execute.
 * @returns {Promise<object>} The transaction receipt.
 */
const sendTransaction = async (method) => {
    try {
        const estimatedGas = await method.estimateGas({ from: senderAddress });
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: senderAddress,
            to: contractAddress,
            gas: estimatedGas,
            gasPrice: gasPrice,
            data: method.encodeABI()
        };
        
        const signed = await web3.eth.accounts.signTransaction(tx, privateKey);
        if (!signed.rawTransaction) {
            throw new Error("Failed to sign transaction. rawTransaction is undefined.");
        }
        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
        return receipt;
    } catch (error) {
        console.error("Transaction Error:", error);
        // Try to get a more specific error from the contract
        if (error.message.includes("revert")) {
            // This is a basic way; a more advanced way involves decoding the revert reason
             throw new Error("Transaction failed: The contract reverted the transaction. Check inputs.");
        }
        throw error;
    }
};

// ============================= //
// === AI INTEGRATION MODULE === //
// ============================= //
// (This module remains unchanged)
async function callGeminiApi(prompt) {
    try {
        // ... (same as your original file)
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("CRITICAL: GEMINI_API_KEY is not configured in the .env file.");
        }
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error communicating with Gemini API:", error);
        if (error.message.includes('API key not valid')) {
            throw new Error("The Gemini API key is invalid. Please check your .env file.");
        }
        throw new Error("Failed to get a valid response from the AI model.");
    }
}

// ======================= //
// === FRONTEND ROUTES === //
// ======================= //
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================== //
// === API ROUTES === //
// ================== //

// --- AI-POWERED ROUTES (Unchanged, but 'patientId' param will now be an email) ---
app.post('/api/ai/analyze-prescription/:patientEmail', authenticateToken, async (req, res) => {
    if (req.user.type !== 'doctor') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const { patientEmail } = req.params;
        const { draftPrescription } = req.body;
        // Step 1: Fetch patient's medical history from the blockchain
        const records = await contract.methods.getHistory(patientEmail).call({ from: senderAddress });
        // ... (rest of the AI logic is the same)
        let rawHistory = "No past medical history found for this patient.";
        if (records && records.length > 0) {
            const historyRecords = await Promise.all(records.map(async (rec) => {
                let data = '';
                try {
                    const chunks = [];
                    for await (const chunk of ipfs.cat(rec.cid)) { chunks.push(chunk); }
                    data = Buffer.concat(chunks).toString('utf8');
                } catch (err) { data = `[Content for CID ${rec.cid} could not be retrieved]`; }
                return `- On ${new Date(parseInt(rec.timestamp.toString())).toLocaleDateString()}, Dr. ${rec.doctorName} diagnosed "${rec.disease}" and prescribed: "${data}".`;
            }));
            rawHistory = historyRecords.join('\n');
        }
        // ... (rest of the AI logic is the same)
        const summarizationPrompt = `...${rawHistory}...`;
        const historySummary = await callGeminiApi(summarizationPrompt);
        const analysisPrompt = `...${historySummary}...${draftPrescription}...`;
        const prescriptionAnalysis = await callGeminiApi(analysisPrompt);
        res.json({ historySummary, prescriptionAnalysis });
    } catch (e) {
        console.error("Error in /api/ai/analyze-prescription:", e);
        res.status(500).json({ error: 'An internal server error occurred. ' + e.message });
    }
});
// ... (Other AI routes remain the same) ...
app.post('/api/ai/summarize-full-history', authenticateToken, async (req, res) => {
    // ... (same as original)
});
app.post('/api/ai/summarize-single-prescription', authenticateToken, async (req, res) => {
    // ... (same as original)
});


// --- [NEW] AUTH ROUTES (BLOCKCHAIN) ---

app.post('/api/patient/register', async (req, res) => {
    try {
        const { name, email, password, contact_number, address, gender, dob } = req.body;
        
        // 1. Check if user already exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        
        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 3. Create details JSON
        const details = JSON.stringify({ contact_number, address, gender, dob });
        
        // 4. Send transaction to register user
        // UserType enum: Patient = 0, Doctor = 1, Hospital = 2
        const method = contract.methods.registerUser(email, hashedPassword, name, 0, details);
        await sendTransaction(method);
        
        res.status(201).json({ message: 'Patient registered successfully!' });
    } catch (error) { 
        console.error("Patient register error:", error);
        res.status(500).json({ error: 'Blockchain error during registration: ' + error.message }); 
    }
});

app.post('/api/patient/login', async (req, res) => {
    try {
        const { email, password } = req.body; // Changed from 'name' to 'email'
        
        // 1. Check if user exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });
        
        // 2. Get user data from blockchain
        const user = await contract.methods.getUser(email).call({ from: senderAddress });
        
        // 3. Verify user type
        if (user.userType.toString() !== '0') { // 0 = Patient
            return res.status(403).json({ error: 'This login is for patients only.' });
        }
        
        // 4. Compare password
        const isMatch = await bcrypt.compare(password, user.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        // 5. Create JWT
        const token = jwt.sign({ email: user.email, type: 'patient', name: user.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { 
        console.error("Patient login error:", error);
        res.status(500).json({ error: 'Server error during login: ' + error.message }); 
    }
});

app.post('/api/doctor/register', async (req, res) => {
    try {
        const { name, email, password, contact_number, specialization, hospital_email } = req.body; // Changed hospital_name to hospital_email
        
        // 1. Check if user already exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) {
            return res.status(409).json({ error: 'A doctor with this email already exists.' });
        }
        
        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 3. Send transaction to request affiliation
        const method = contract.methods.requestDoctorAffiliation(email, hashedPassword, name, specialization, hospital_email, contact_number);
        await sendTransaction(method);
        
        res.status(201).json({ message: 'Doctor registration request submitted! Your registration is pending approval from the hospital.' });
    } catch (error) {
        console.error('Doctor registration error:', error);
        res.status(500).json({ error: 'Blockchain error during doctor registration: ' + error.message });
    }
});

app.post('/api/doctor/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. Check if user exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });

        // 2. Get user data
        const doctor = await contract.methods.getUser(email).call({ from: senderAddress });
        
        // 3. Verify user type
        if (doctor.userType.toString() !== '1') { // 1 = Doctor
            return res.status(403).json({ error: 'This login is for doctors only.' });
        }
        
        // 4. Compare password
        const isMatch = await bcrypt.compare(password, doctor.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        // 5. Check affiliation status
        const [hospitalEmail, status] = await contract.methods.getDoctorAffiliation(email).call({ from: senderAddress });
        const affiliationStatus = status.toString(); // 0=Pending, 1=Approved, 2=Revoked

        if (affiliationStatus === '0') {
            return res.status(403).json({ error: 'Your account is pending approval by the hospital.' });
        }
        if (affiliationStatus === '2') {
            return res.status(403).json({ error: 'Your affiliation with the hospital has been revoked.' });
        }
        if (affiliationStatus !== '1') {
            return res.status(403).json({ error: 'Your account is not approved.' });
        }

        // 6. Get hospital name for token
        const hospital = await contract.methods.getUser(hospitalEmail).call({ from: senderAddress });

        // 7. Create JWT
        const token = jwt.sign({ email: doctor.email, type: 'doctor', name: doctor.name, hospital_name: hospital.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { 
        console.error("Doctor login error:", error);
        res.status(500).json({ error: 'Server error during login: ' + error.message }); 
    }
});

app.post('/api/hospital/register', async (req, res) => {
    try {
        const { hospital_name, email, password, phone, address, num_beds, specialties } = req.body;
        
        // 1. Check if user already exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) {
            return res.status(409).json({ error: 'A hospital with this email already exists.' });
        }
        
        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 3. Create details JSON
        const details = JSON.stringify({ phone, address, num_beds, specialties });
        
        // 4. Send transaction to register
        // UserType enum: Patient = 0, Doctor = 1, Hospital = 2
        const method = contract.methods.registerUser(email, hashedPassword, hospital_name, 2, details);
        await sendTransaction(method);
        
        res.status(201).json({ message: 'Hospital registered successfully!' });
    } catch (error) { 
        console.error("Hospital register error:", error);
        res.status(500).json({ error: 'Blockchain error during hospital registration: ' + error.message }); 
    }
});

app.post('/api/hospital/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. Check if user exists
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });
        
        // 2. Get user data
        const hospital = await contract.methods.getUser(email).call({ from: senderAddress });
        
        // 3. Verify user type
        if (hospital.userType.toString() !== '2') { // 2 = Hospital
            return res.status(403).json({ error: 'This login is for hospitals only.' });
        }
        
        // 4. Compare password
        const isMatch = await bcrypt.compare(password, hospital.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        // 5. Create JWT
        const token = jwt.sign({ email: hospital.email, type: 'hospital', name: hospital.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { 
        console.error("Hospital login error:", error);
        res.status(500).json({ error: 'Server error during login: ' + error.message }); 
    }
});

// --- [NEW] APPOINTMENT WORKFLOW ROUTES (BLOCKCHAIN) ---

app.get('/api/hospitals', authenticateToken, async (req, res) => {
    try {
        const hospitals = await contract.methods.getAllHospitals().call({ from: senderAddress });
        // Format the data to match the old SQL response: { id, hospital_name }
        const formattedHospitals = hospitals.map(h => ({
            id: h.email, // Use email as the unique ID
            hospital_name: h.name
        }));
        res.json(formattedHospitals);
    } catch (error) {
        console.error('Failed to fetch hospitals:', error);
        res.status(500).json({ error: 'Failed to fetch hospitals from blockchain.' });
    }
});

app.get('/api/available-doctors', authenticateToken, async (req, res) => {
    try {
        const { hospital_email } = req.query; // Changed from 'hospital' (name) to 'hospital_email'
        if (!hospital_email) {
            return res.status(400).json({ error: 'Hospital email is required.' });
        }
        
        const allAffiliations = await contract.methods.getHospitalDoctors(hospital_email).call({ from: senderAddress });
        
        // Filter for only 'Approved' (status == 1) doctors
        const availableDoctors = allAffiliations
            .filter(doc => doc.status.toString() === '1') // 1 = Approved
            .map(doc => ({
                doctor_id: doc.doctorEmail, // Use email as the ID
                name: doc.doctorName,
                specialization: doc.specialization
            }));
            
        res.json(availableDoctors);
    } catch (error) { 
        console.error('Failed to fetch available doctors:', error);
        res.status(500).json({ error: 'Failed to fetch available doctors from blockchain.' }); 
    }
});

app.get('/api/doctor-details/:email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.params;
        const doctor = await contract.methods.getUser(email).call({ from: senderAddress });
        
        if (!doctor.isRegistered || doctor.userType.toString() !== '1') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        
        // 'details' field in the contract stores specialization
        res.json({ name: doctor.name, specialization: doctor.details });
    } catch (error) {
        console.error('Failed to fetch doctor details:', error);
        res.status(500).json({ error: 'Failed to fetch doctor details.' });
    }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const { doctor_email, appointment_time, doctor_name } = req.body; // doctor_id is now doctor_email
        const patient_email = req.user.email;
        const patient_name = req.user.name;
        
        const consulting_id = crypto.randomBytes(4).toString('hex').toUpperCase();
        
        const method = contract.methods.bookAppointment(
            consulting_id,
            patient_email,
            doctor_email,
            appointment_time,
            patient_name,
            doctor_name
        );
        await sendTransaction(method);
        
        res.status(201).json({ message: 'Appointment booked successfully! Awaiting hospital approval.', consulting_id });
    } catch (error) { 
        console.error('Failed to book appointment:', error);
        res.status(500).json({ error: 'Failed to book appointment: ' + error.message }); 
    }
});

app.get('/api/my-patient-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const appointments = await contract.methods.getAppointmentsForPatient(req.user.email).call({ from: senderAddress });
        // Format to match old response
        const formatted = appointments.map(a => ({
            appointment_id: a.consultingId, // Use consultingId as the unique ID
            appointment_time: a.appointmentTime,
            status: a.status,
            doctor_name: a.doctorName
        })).reverse();
        res.json(formatted);
    } catch (error) { 
        console.error('Failed to fetch patient appointments:', error);
        res.status(500).json({ error: 'Failed to fetch your appointments' }); 
    }
});

app.get('/api/all-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hospitalEmail = req.user.email; 
        const appointments = await contract.methods.getAppointmentsForHospital(hospitalEmail).call({ from: senderAddress });
        
        // Format to match old response
        const formatted = appointments.map(a => ({
            appointment_id: a.consultingId, // Use consultingId as the unique ID
            consulting_id: a.consultingId,
            patient_email: a.patientEmail,
            doctor_email: a.doctorEmail,
            patient_name: a.patientName,
            doctor_name: a.doctorName,
            appointment_time: a.appointmentTime,
            status: a.status
        })).reverse();
        
        res.json(formatted);
    } catch (error) { 
        console.error('Failed to fetch all appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments.' }); 
    }
});

app.put('/api/appointments/:consultingId/status', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const { status } = req.body; // "Approved" or "Rejected"
        const { consultingId } = req.params;
        const hospitalEmail = req.user.email;
        
        const method = contract.methods.updateAppointmentStatus(hospitalEmail, consultingId, status);
        await sendTransaction(method);
        
        res.json({ message: `Appointment ${consultingId} has been ${status}.` });
    } catch (error) { 
        console.error('Failed to update appointment status:', error);
        res.status(500).json({ error: 'Failed to update appointment status: ' + error.message }); 
    }
});

// --- [NEW] DOCTOR MANAGEMENT ROUTES (BLOCKCHAIN) ---

app.get('/api/hospital/doctors', authenticateToken, async (req, res) => {
    // This new route gets ALL doctors (pending, approved, revoked) for the hospital dashboard
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hospitalEmail = req.user.email;
        const affiliations = await contract.methods.getHospitalDoctors(hospitalEmail).call({ from: senderAddress });

        // Format to a consistent JSON structure
        const formattedDoctors = affiliations.map(doc => {
            let statusString = 'Pending';
            if (doc.status.toString() === '1') statusString = 'Approved';
            if (doc.status.toString() === '2') statusString = 'Revoked';

            return {
                doctor_email: doc.doctorEmail, // This is the new unique ID
                name: doc.doctorName,
                specialization: doc.specialization,
                status: statusString,
                timestamp: doc.timestamp.toString()
            };
        });

        res.json(formattedDoctors);
    } catch (error) {
        console.error('Failed to fetch hospital doctors:', error);
        res.status(500).json({ error: 'Failed to fetch doctor list.' });
    }
});

app.put('/api/doctors/:doctorEmail/status', authenticateToken, async (req, res) => {
    // This route now uses doctorEmail as the parameter
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const { status } = req.body; // "Approved", "Rejected", "Revoked"
        const { doctorEmail } = req.params;
        const hospitalEmail = req.user.email;
        
        let statusEnum; // 0=Pending, 1=Approved, 2=Revoked
        if (status === 'Approved') statusEnum = 1;
        else if (status === 'Revoked') statusEnum = 2;
        else statusEnum = 0; // Default to Pending/Rejected (which is 0)
        
        // "Rejected" is not a state, it's just setting it back to "Pending" or "Revoked".
        // Let's use "Revoked" for "Rejected"
        if (status === 'Rejected') statusEnum = 2; // Treat "Reject" as "Revoke"
        
        const method = contract.methods.manageDoctorAffiliation(hospitalEmail, doctorEmail, statusEnum);
        await sendTransaction(method);
        
        res.json({ message: `Doctor has been ${status}.` });
    } catch (error) {
        console.error('Failed to update doctor status:', error);
        res.status(500).json({ error: 'Failed to update doctor status: ' + error.message });
    }
});

app.get('/api/my-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    try {
        const doctorEmail = req.user.email;
        const appointments = await contract.methods.getAppointmentsForDoctor(doctorEmail).call({ from: senderAddress });
        
        // Filter for 'Approved' appointments, as per old SQL logic
        const formatted = appointments
            .filter(a => a.status === 'Approved')
            .map(a => ({
                appointment_id: a.consultingId,
                consulting_id: a.consultingId,
                appointment_time: a.appointmentTime,
                patient_id: a.patientEmail, // Patient ID is now their email
                patient_name: a.patientName,
                // gender and contact_number are not stored in Appointment struct
                // The frontend must be adapted, or fetch patient details separately
            }));
            
        res.json(formatted);
    } catch (error) { 
        console.error('Failed to fetch doctor appointments:', error);
        res.status(500).json({ error: 'Failed to fetch your appointments.' }); 
    }
});


// --- [UPDATED] DECENTRALIZED MEDICAL RECORD & CONSENT ROUTES ---

app.get('/api/my-prescriptions', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const patientEmail = req.user.email; // Use email from token
        const records = await contract.methods.getHistory(patientEmail).call({ from: senderAddress });
        if (!records || records.length === 0) {
            return res.json([]); 
        }
        // ... (rest of IPFS logic is the same)
        const results = await Promise.all(records.map(async rec => {
            let data = '';
            try {
                const chunks = [];
                for await (const chunk of ipfs.cat(rec.cid)) { chunks.push(chunk); }
                data = Buffer.concat(chunks).toString('utf8');
            } catch (err) { data = '[Error: Could not retrieve prescription content.]'; }
            return {
                doctorName: rec.doctorName,
                disease: rec.disease,
                timestamp: rec.timestamp.toString(),
                data: data,
            };
        }));
        res.json(results.reverse());
    } catch (e) {
        console.error("API Error in /api/my-prescriptions:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/prescription', authenticateToken, upload.single('file'), async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    try {
        let prescriptionData;
        // ... (file handling logic is the same)
        if (req.file) {
            prescriptionData = fs.readFileSync(req.file.path);
            fs.unlinkSync(req.file.path);
        } else if (req.body.text) {
            prescriptionData = Buffer.from(req.body.text);
        } else {
            return res.status(400).json({ error: "No prescription data provided" });
        }
        
        const ipfsResult = await ipfs.add(prescriptionData);
        const cid = ipfsResult.cid.toString();
        
        const { patientEmail, disease } = req.body; // Changed from patientId
        const doctorName = req.user.name;
        const timestamp = Date.now();
        
        const prescriptionMethod = contract.methods.addPrescription(patientEmail, doctorName, disease, cid, timestamp);
        const receipt = await sendTransaction(prescriptionMethod); // Use helper
        
        res.json({ success: true, cid: cid, transactionHash: receipt.transactionHash });
    } catch (e) { 
        console.error("API Error in /api/prescription:", e);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/consent', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const { granteeEmail, accessLevel, duration, status } = req.body; // Changed from granteeId
        const patientEmail = req.user.email;
        
        const consentMethod = contract.methods.manageConsent(patientEmail, granteeEmail, accessLevel, duration, status);
        const receipt = await sendTransaction(consentMethod); // Use helper
        
        res.json({ success: true, message: `Consent status set to ${status}.`, transactionHash: receipt.transactionHash });
    } catch(e) {
        console.error("API Error in /api/consent:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/consent-log', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const patientEmail = req.user.email;
        const log = await contract.methods.getConsentLog(patientEmail).call({ from: senderAddress });
        if (!log) return res.json({ log: [] });
        
        const serializableLog = log.map(entry => ({
            granteeId: entry.granteeId, // This is now granteeEmail
            accessLevel: entry.accessLevel,
            duration: entry.duration.toString(),
            status: entry.status,
            timestamp: entry.timestamp.toString()
        }));
        res.json({ log: serializableLog });
    } catch(e) {
        console.error("API Error in /api/consent-log:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/transaction-log', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const patientEmail = req.user.email;
        const log = await contract.methods.getTransactionLog(patientEmail).call({ from: senderAddress });
        // ... (same as original, but data is now from the new contract)
        if (!log) return res.json({ log: [] });
        const serializableLog = log.map(entry => ({
            timestamp: entry.timestamp.toString(),
            logType: entry.logType.toString(),
            performedBy: entry.performedBy,
            details: entry.details
        }));
        res.json({ log: serializableLog });
    } catch(e) {
        console.error("API Error in /api/transaction-log:", e);
        res.status(500).json({ error: e.message });
    }
});


app.get('/api/history/:patientEmail', authenticateToken, async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    
    try {
        const { patientEmail } = req.params; // Param is now patientEmail
        const requesterEmail = req.user.email; 
        
        const consentLog = await contract.methods.getConsentLog(patientEmail).call({ from: senderAddress });
        
        let hasValidConsent = false;
        if (consentLog) {
            for (let i = consentLog.length - 1; i >= 0; i--) {
                const consent = consentLog[i];
                if (consent.granteeId === requesterEmail) { // Check email
                    if (consent.status === 'Granted') {
                        // ... (timestamp logic is the same)
                        const consentTimestamp = parseInt(consent.timestamp.toString());
                        const duration = parseInt(consent.duration.toString());
                        const nowInSeconds = Math.floor(Date.now() / 1000);
                        if ((consentTimestamp + duration) > nowInSeconds) {
                            hasValidConsent = true;
                        }
                    }
                    break;
                }
            }
        }
        
        if (!hasValidConsent) {
            return res.status(403).json({ error: 'Access Denied. Patient consent is required or has expired.' });
        }
        
        // Log the access
        const logAccessMethod = contract.methods.logHistoryAccess(patientEmail, requesterEmail);
        await sendTransaction(logAccessMethod);
        
        // Fetch the history
        const records = await contract.methods.getHistory(patientEmail).call({ from: senderAddress });
        if (!records || records.length === 0) return res.json({ history: [] });
        
        // ... (IPFS logic is the same)
        const results = await Promise.all(records.map(async rec => {
            let data = '';
            try {
                const chunks = [];
                for await (const chunk of ipfs.cat(rec.cid)) { chunks.push(chunk); }
                data = Buffer.concat(chunks).toString('utf8');
            } catch (err) { data = '[Error: Content not found on IPFS]'; }
            return {
                doctorName: rec.doctorName, disease: rec.disease, cid: rec.cid,
                timestamp: rec.timestamp.toString(), data,
            };
        }));
        res.json({ history: results });
    } catch (e) {
        console.error("API Error in /api/history:", e);
        res.status(500).json({ error: e.message });
    }
});


// ====================== //
// === SERVER STARTUP === //
// ====================== //
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        const { create } = await import('ipfs-http-client');
        ipfs = create({ host: 'localhost', port: '5001', protocol: 'http' });
        console.log('IPFS client initialized successfully.');
        app.listen(PORT, () => {
            console.log(`Server is running. Open http://localhost:${PORT} in your browser.`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error);
        process.exit(1);
    }
};

startServer();