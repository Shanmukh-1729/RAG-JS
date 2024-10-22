const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const { RAGchatbot, uploadUserFile } = require('../controler/uploadQuery');

// Define multer storage and file handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Folder to store uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Rename the file
  }
});

const upload = multer({ storage: storage });

router.route("/query").post(RAGchatbot);
router.route("/uploadpdf").post(upload.array('pdfFiles', 5),uploadUserFile);

module.exports = router;