// --- CORE DEPENDENCIES ---
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const { Web3 } = require('web3');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// --- INITIALIZATIONS ---
const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- IPFS & WEB3 ---
let ipfs;
const web3 = new Web3('http://127.0.0.1:7545');

// ⚠️ PASTE YOUR FULL ABI HERE ⚠️
const contractABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "doctorEmail",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "enum MedicalRecord.AffiliationStatus",
				"name": "status",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "AffiliationManaged",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "patientId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "details",
				"type": "string"
			}
		],
		"name": "AppointmentBooked",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "consultingId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "AppointmentStatusUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "patientId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "granteeId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "ConsentManaged",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "patientId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "doctorId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "HistoryAccessed",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "patientId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "doctorId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "cid",
				"type": "string"
			}
		],
		"name": "RecordUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "email",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "enum MedicalRecord.UserType",
				"name": "userType",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "UserRegistered",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_disease",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_cid",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "_timestamp",
				"type": "uint256"
			}
		],
		"name": "addPrescription",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "appointmentsForDoctor",
		"outputs": [
			{
				"internalType": "string",
				"name": "consultingId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "appointmentTime",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "appointmentsForHospital",
		"outputs": [
			{
				"internalType": "string",
				"name": "consultingId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "appointmentTime",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "appointmentsForPatient",
		"outputs": [
			{
				"internalType": "string",
				"name": "consultingId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "patientName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "appointmentTime",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_consultingId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_appointmentTime",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_patientName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorName",
				"type": "string"
			}
		],
		"name": "bookAppointment",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "consentLog",
		"outputs": [
			{
				"internalType": "string",
				"name": "granteeId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "accessLevel",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "duration",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "status",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "doctorAffiliationStatus",
		"outputs": [
			{
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "enum MedicalRecord.AffiliationStatus",
				"name": "status",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
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
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			}
		],
		"name": "getAppointmentsForDoctor",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "consultingId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "hospitalEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "appointmentTime",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "status",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.Appointment[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_hospitalEmail",
				"type": "string"
			}
		],
		"name": "getAppointmentsForHospital",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "consultingId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "hospitalEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "appointmentTime",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "status",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.Appointment[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			}
		],
		"name": "getAppointmentsForPatient",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "consultingId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "hospitalEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "patientName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "appointmentTime",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "status",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.Appointment[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			}
		],
		"name": "getConsentLog",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "granteeId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "accessLevel",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "duration",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "status",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.Consent[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			}
		],
		"name": "getDoctorAffiliation",
		"outputs": [
			{
				"internalType": "string",
				"name": "hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "enum MedicalRecord.AffiliationStatus",
				"name": "status",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			}
		],
		"name": "getHistory",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "doctorName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "disease",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "cid",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.Prescription[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_hospitalEmail",
				"type": "string"
			}
		],
		"name": "getHospitalDoctors",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "doctorEmail",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "doctorName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "specialization",
						"type": "string"
					},
					{
						"internalType": "enum MedicalRecord.AffiliationStatus",
						"name": "status",
						"type": "uint8"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct MedicalRecord.DoctorAffiliation[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			}
		],
		"name": "getTransactionLog",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					},
					{
						"internalType": "enum MedicalRecord.LogType",
						"name": "logType",
						"type": "uint8"
					},
					{
						"internalType": "string",
						"name": "performedBy",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "details",
						"type": "string"
					}
				],
				"internalType": "struct MedicalRecord.TransactionLog[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_email",
				"type": "string"
			}
		],
		"name": "getUser",
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
				"internalType": "struct MedicalRecord.User",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "hospitalAppointmentIndex",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "hospitalDoctorAffiliations",
		"outputs": [
			{
				"internalType": "string",
				"name": "doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "specialization",
				"type": "string"
			},
			{
				"internalType": "enum MedicalRecord.AffiliationStatus",
				"name": "status",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "hospitalList",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "isHospitalInList",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "isUserEmailRegistered",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			}
		],
		"name": "logHistoryAccess",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_patientEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_granteeEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_accessLevel",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "_duration",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_status",
				"type": "string"
			}
		],
		"name": "manageConsent",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			},
			{
				"internalType": "enum MedicalRecord.AffiliationStatus",
				"name": "_status",
				"type": "uint8"
			}
		],
		"name": "manageDoctorAffiliation",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "records",
		"outputs": [
			{
				"internalType": "string",
				"name": "doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "disease",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "cid",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_email",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_hashedPassword",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"internalType": "enum MedicalRecord.UserType",
				"name": "_userType",
				"type": "uint8"
			},
			{
				"internalType": "string",
				"name": "_details",
				"type": "string"
			}
		],
		"name": "registerUser",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_doctorEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_hashedPassword",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_doctorName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_specialization",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_contactDetails",
				"type": "string"
			}
		],
		"name": "requestDoctorAffiliation",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "transactionLogs",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"internalType": "enum MedicalRecord.LogType",
				"name": "logType",
				"type": "uint8"
			},
			{
				"internalType": "string",
				"name": "performedBy",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "details",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_hospitalEmail",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_consultingId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_status",
				"type": "string"
			}
		],
		"name": "updateAppointmentStatus",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "users",
		"outputs": [
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
		"stateMutability": "view",
		"type": "function"
	}
];

// ⚠ UPDATE THESE ADDRESSES & KEYS ⚠
const contractAddress = '0xc974d485967222bFc9cce5D9ed6Ceb6D4e028bCD';
const senderAddress = '0xFaABF7C7Ff55D37732F39452695627Cd692dd38A';
const privateKey = '0x77613fff4214412e3ee3c76fb41f17423bead48b1b5a17d8afbb9de50f115c86';
const contract = new web3.eth.Contract(contractABI, contractAddress);

// --- FILE UPLOAD & JWT ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const JWT_SECRET = process.env.JWT_SECRET || 'a-very-secure-secret-key-for-jwt';

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- TRANSACTION HELPER ---
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
        return await web3.eth.sendSignedTransaction(signed.rawTransaction);
    } catch (error) {
        console.error("Transaction Error:", error);
        throw error;
    }
};

// --- AI HELPER ---
async function callGeminiApi(prompt) {
    try {
        if (!process.env.GEMINI_API_KEY) throw new Error("CRITICAL: GEMINI_API_KEY is missing.");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("AI service failed.");
    }
}

// ======================= //
// === MAIN APP ROUTES === //
// ======================= //

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- PUBLIC ROUTES ---
app.get('/api/hospitals', async (req, res) => {
    try {
        const hospitals = await contract.methods.getAllHospitals().call({ from: senderAddress });
        const formattedHospitals = hospitals.map(h => ({
            id: h.email,
            hospital_name: h.name
        }));
        res.json(formattedHospitals);
    } catch (error) {
        console.error('Failed to fetch hospitals:', error);
        res.status(500).json({ error: 'Failed to fetch hospitals from blockchain.' });
    }
});

// --- AUTH ROUTES ---
app.post('/api/patient/register', async (req, res) => {
    try {
        const { name, email, password, contact_number, address, gender, dob } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) return res.status(409).json({ error: 'Email already registered.' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const details = JSON.stringify({ contact_number, address, gender, dob });
        const method = contract.methods.registerUser(email, hashedPassword, name, 0, details);
        await sendTransaction(method);
        res.status(201).json({ message: 'Patient registered successfully!' });
    } catch (error) { res.status(500).json({ error: 'Registration failed: ' + error.message }); }
});

app.post('/api/patient/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = await contract.methods.getUser(email).call({ from: senderAddress });
        if (user.userType.toString() !== '0') return res.status(403).json({ error: 'Not a patient account.' });
        
        const isMatch = await bcrypt.compare(password, user.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ email: user.email, type: 'patient', name: user.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { res.status(500).json({ error: 'Login failed: ' + error.message }); }
});

app.post('/api/doctor/register', async (req, res) => {
    try {
        const { name, email, password, contact_number, specialization, hospital_email } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) return res.status(409).json({ error: 'Email already registered.' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const method = contract.methods.requestDoctorAffiliation(email, hashedPassword, name, specialization, hospital_email, contact_number);
        await sendTransaction(method);
        res.status(201).json({ message: 'Request submitted. Please wait for hospital approval.' });
    } catch (error) { res.status(500).json({ error: 'Registration failed: ' + error.message }); }
});

app.post('/api/doctor/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });

        const doctor = await contract.methods.getUser(email).call({ from: senderAddress });
        if (doctor.userType.toString() !== '1') return res.status(403).json({ error: 'Not a doctor account.' });
        
        const isMatch = await bcrypt.compare(password, doctor.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const affiliation = await contract.methods.getDoctorAffiliation(email).call({ from: senderAddress });
        const status = affiliation.status.toString(); // Use named return parameter from struct

        if (status === '0') return res.status(403).json({ error: 'Account pending approval.' });
        if (status === '2') return res.status(403).json({ error: 'Account revoked.' });
        if (status !== '1') return res.status(403).json({ error: 'Account not approved.' });

        const hospital = await contract.methods.getUser(affiliation.hospitalEmail).call({ from: senderAddress });
        const token = jwt.sign({ email: doctor.email, type: 'doctor', name: doctor.name, hospital_name: hospital.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { res.status(500).json({ error: 'Login failed: ' + error.message }); }
});

app.post('/api/hospital/register', async (req, res) => {
    try {
        const { hospital_name, email, password, phone, address, num_beds, specialties } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (userExists) return res.status(409).json({ error: 'Email already registered.' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const details = JSON.stringify({ phone, address, num_beds, specialties });
        const method = contract.methods.registerUser(email, hashedPassword, hospital_name, 2, details);
        await sendTransaction(method);
        res.status(201).json({ message: 'Hospital registered successfully!' });
    } catch (error) { res.status(500).json({ error: 'Registration failed: ' + error.message }); }
});

app.post('/api/hospital/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExists = await contract.methods.isUserEmailRegistered(email).call({ from: senderAddress });
        if (!userExists) return res.status(401).json({ error: 'Invalid credentials' });
        
        const hospital = await contract.methods.getUser(email).call({ from: senderAddress });
        if (hospital.userType.toString() !== '2') return res.status(403).json({ error: 'Not a hospital account.' });
        
        const isMatch = await bcrypt.compare(password, hospital.hashedPassword);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ email: hospital.email, type: 'hospital', name: hospital.name }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) { res.status(500).json({ error: 'Login failed: ' + error.message }); }
});

// --- PATIENT & APPOINTMENT ROUTES ---

app.get('/api/doctor-details/:email', authenticateToken, async (req, res) => {
    try {
        const doctorUser = await contract.methods.getUser(req.params.email).call({ from: senderAddress });
        let specialization = 'General';
        try {
             const details = JSON.parse(doctorUser.details || '{}');
             specialization = details.specialization || 'General';
        } catch (e) {}

        res.json({
            name: doctorUser.name,
            email: doctorUser.email,
            specialization: specialization
        });
    } catch (error) {
        console.error("Error fetching doctor details:", error);
        res.status(500).json({ error: 'Failed to fetch doctor details.' });
    }
});

app.get('/api/available-doctors', authenticateToken, async (req, res) => {
    try {
        const { hospital_email } = req.query;
        if (!hospital_email) return res.status(400).json({ error: 'Hospital email required.' });
        
        const allAffiliations = await contract.methods.getHospitalDoctors(hospital_email).call({ from: senderAddress });
        const availableDoctors = allAffiliations
            .filter(doc => doc.status.toString() === '1') // Approved only
            .map(doc => ({ doctor_id: doc.doctorEmail, name: doc.doctorName, specialization: doc.specialization }));
        res.json(availableDoctors);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch doctors.' }); }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const { doctor_email, appointment_time, doctor_name } = req.body;
        const consulting_id = crypto.randomBytes(4).toString('hex').toUpperCase();
        const method = contract.methods.bookAppointment(consulting_id, req.user.email, doctor_email, appointment_time, req.user.name, doctor_name);
        await sendTransaction(method);
        res.status(201).json({ message: 'Appointment booked!', consulting_id });
    } catch (error) { res.status(500).json({ error: 'Booking failed: ' + error.message }); }
});

app.get('/api/my-patient-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const appointments = await contract.methods.getAppointmentsForPatient(req.user.email).call({ from: senderAddress });
        res.json(appointments.map(a => ({ appointment_id: a.consultingId, consulting_id: a.consultingId, appointment_time: a.appointmentTime, status: a.status, doctor_name: a.doctorName })).reverse());
    } catch (error) { res.status(500).json({ error: 'Failed to fetch appointments' }); }
});

// --- HOSPITAL DASHBOARD ROUTES ---
app.get('/api/all-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const appointments = await contract.methods.getAppointmentsForHospital(req.user.email).call({ from: senderAddress });
        res.json(appointments.map(a => ({ 
            consulting_id: a.consultingId, 
            patient_name: a.patientName,
            patient_email: a.patientEmail,
            doctor_name: a.doctorName,
            appointment_time: a.appointmentTime,
            status: a.status
        })).reverse());
    } catch (error) { 
        console.error("Error fetching hospital appointments:", error);
        res.status(500).json({ error: 'Failed to fetch appointments.' }); 
    }
});

app.put('/api/appointments/:consultingId/status', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const method = contract.methods.updateAppointmentStatus(req.user.email, req.params.consultingId, req.body.status);
        await sendTransaction(method);
        res.json({ message: `Appointment updated to ${req.body.status}.` });
    } catch (error) { res.status(500).json({ error: 'Update failed: ' + error.message }); }
});

app.get('/api/hospital/doctors', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        const affiliations = await contract.methods.getHospitalDoctors(req.user.email).call({ from: senderAddress });
        res.json(affiliations.map(doc => ({
            doctor_email: doc.doctorEmail, name: doc.doctorName, specialization: doc.specialization,
            status: doc.status.toString() === '1' ? 'Approved' : (doc.status.toString() === '2' ? 'Revoked' : 'Pending')
        })));
    } catch (error) { res.status(500).json({ error: 'Failed to fetch doctors.' }); }
});

app.put('/api/doctors/:doctorEmail/status', authenticateToken, async (req, res) => {
    if (req.user.type !== 'hospital') return res.status(403).json({ error: 'Forbidden' });
    try {
        let statusEnum = req.body.status === 'Approved' ? 1 : (req.body.status === 'Revoked' || req.body.status === 'Rejected' ? 2 : 0);
        const method = contract.methods.manageDoctorAffiliation(req.user.email, req.params.doctorEmail, statusEnum);
        await sendTransaction(method);
        res.json({ message: `Doctor status updated.` });
    } catch (error) { res.status(500).json({ error: 'Update failed: ' + error.message }); }
});

// --- DOCTOR DASHBOARD ROUTES ---
app.get('/api/my-appointments', authenticateToken, async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    try {
        const appointments = await contract.methods.getAppointmentsForDoctor(req.user.email).call({ from: senderAddress });
        res.json(appointments.filter(a => a.status === 'Approved').map(a => ({
            appointment_id: a.consultingId, consulting_id: a.consultingId, appointment_time: a.appointmentTime,
            patient_id: a.patientEmail, patient_name: a.patientName
        })));
    } catch (error) { res.status(500).json({ error: 'Failed to fetch appointments.' }); }
});

app.get('/api/my-prescriptions', authenticateToken, async (req, res) => {
    if (req.user.type !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    try {
        const records = await contract.methods.getHistory(req.user.email).call({ from: senderAddress });
        const results = await Promise.all(records.map(async rec => {
            let data = '';
            try { for await (const chunk of ipfs.cat(rec.cid)) data += Buffer.from(chunk).toString('utf8'); } 
            catch (err) { data = '[Error retreiving IPFS content]'; }
            return { doctorName: rec.doctorName, disease: rec.disease, timestamp: rec.timestamp.toString(), data };
        }));
        res.json(results.reverse());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/prescription', authenticateToken, upload.single('file'), async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    try {
        let data = req.file ? fs.readFileSync(req.file.path) : Buffer.from(req.body.text);
        if (req.file) fs.unlinkSync(req.file.path);
        const { cid } = await ipfs.add(data);
        const method = contract.methods.addPrescription(req.body.patientEmail, req.user.name, req.body.disease, cid.toString(), Date.now());
        const receipt = await sendTransaction(method);
        res.json({ success: true, cid: cid.toString(), transactionHash: receipt.transactionHash });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/analyze-prescription/:patientEmail', authenticateToken, async (req, res) => {
    if (req.user.type !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    try {
        const records = await contract.methods.getHistory(req.params.patientEmail).call({ from: senderAddress });
        let historyTxt = "No history.";
        if (records.length > 0) {
             const history = await Promise.all(records.map(async rec => {
                let data = ''; try { for await (const chunk of ipfs.cat(rec.cid)) data += Buffer.from(chunk).toString('utf8'); } catch (e) {}
                return `- ${new Date(parseInt(rec.timestamp.toString())).toLocaleDateString()}: ${rec.disease} (Dr. ${rec.doctorName}) - ${data}`;
            }));
            historyTxt = history.join('\n');
        }
        const summary = await callGeminiApi(`Summarize medical history:\n${historyTxt}`);
        const analysis = await callGeminiApi(`Patient History Summary:\n${summary}\n\nDraft Prescription:\n${req.body.draftPrescription}\n\nAnalyze for issues, suggest mods, rewrite.`);
        res.json({ historySummary: summary, prescriptionAnalysis: analysis });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    try {
        // Use dynamic import for ipfs-http-client which is ESM
        const { create } = await import('ipfs-http-client');
        ipfs = create({ host: 'localhost', port: '5001', protocol: 'http' });
        console.log('IPFS initialized.');
        app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    } catch (e) { console.error('Server failed to start:', e); }
};
startServer();