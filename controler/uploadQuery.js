const path = require('path');
const fs = require('fs');
const { extractTextFromPDF, extractText, textSplitter, deleteFolderFiles, saveLocalJson, fetchTopK, embedAzureOpenAI, answerUserQuery, generateSummary } = require('../utils/textHandler')

// Controller to answer user questions based on the pinecone index
const RAGchatbot = async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: "Cannot have a null question." })
    }
    queryEmbedding = await embedAzureOpenAI(question);
    topKChunks = await fetchTopK(queryEmbedding, topK = 10,minSimmilarity=0.7);
    const { answer, filenames, topChunks } = await answerUserQuery(question, topKChunks);
    // console.log(`User Request Question : ${question}`)
    res.send({
        "answer": answer,
        "filenames": filenames,
        // "topChunks": topChunks
    })
}

// Controller to upload pdf files to the pinecone index
const uploadUserFile = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const fileContents = {};
        const fileSummaries = {};
        for (const file of req.files) {
            // Store original filename and create a new file path
            const originalFilename = file.originalname; // This retains the original filename
            const filePath = path.join(__dirname, '../uploads/', originalFilename);

            // Move the uploaded file to the desired location with the original name
            await fs.promises.rename(file.path, filePath);

            // Extract text from the PDF using the original filename
            fileContents[originalFilename] = await extractText(filePath);
            fileSummaries[originalFilename] = await generateSummary(fileContents[originalFilename]);
        }

        const chunks = await textSplitter(fileContents, 6000, 500);
        // console.log("finalChunks[",chunks[0]);
        await saveLocalJson(chunks);

        await deleteFolderFiles(path.join(__dirname, '../uploads/'));
        console.log('Files Deleted Successfully');

        res.status(200).json({ message: 'Files processed Succesfully!', summaries:fileSummaries, chunks: chunks });
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).json({ error: 'Error processing files' });
    }
};

module.exports = { RAGchatbot, uploadUserFile }