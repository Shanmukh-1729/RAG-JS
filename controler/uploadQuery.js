const path = require('path');
const fs = require('fs');
const { extractText, textSplitter, deleteFolderFiles, embedAzureOpenAI, answerUserQuery, generateSummary, rephraseQuestion } = require('../utils/textHandler')
const { createVectors,fetchTopKDocuments } = require("../utils/mongoDBHelper")


// const {fetchTopKPinecone,upsertEmbeddingsPinecone} = require('../utils/pineConeHelper')


// Controller to answer user questions based on the pinecone index
const RAGchatbot = async (req, res) => {
    let { question, history } = req.body;
    const brainId = "603d9b6e8f1b2c001f8d1a92";
    // console.log(history);
    if (!question) {
        return res.status(400).json({ error: "Cannot have a null question." })
    }
    if(history.length !== 0){
        let resp = await rephraseQuestion(history,question);
        question = resp.question;
        console.log("question",question,resp)
    }
    queryEmbedding = await embedAzureOpenAI(question);

    // const topKChunks = await fetchTopK(queryEmbedding, topK = 10,minSimmilarity=0.7);
    const topKChunks = await fetchTopKDocuments(brainId,queryEmbedding,similarityCutoff =  0.7, topK = 10)
    // console.log(topKChunks)
    // topKChunks = await fetchTopKPinecone(queryEmbedding, topK = 10,similarityCut=0.7);
    
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
        // console.log(req);
        const { brainName, brainId } = req.body;
        // console.log(brainName, brainId, req.body);

        if (!brainName || !brainId) {
            return res.status(400).json({ error: 'brainName and brainId are required' });
        }

        const fileContents = {};
        const fileSummaries = {};
        for (const file of req.files) {

            // Store original filename and create a new file path
            const originalFilename = file.originalname; // This retains the original filename
            const filePath = path.join(__dirname, '../uploads/', originalFilename);
            
            console.log(`Started process for File ${filePath}`)

            // Move the uploaded file to the desired location with the original name
            await fs.promises.rename(file.path, filePath);

            // Extract text from the PDF using the original filename
            fileContents[originalFilename] = await extractText(filePath);
            console.log(`Text Extracted`)

            // fileSummaries[originalFilename] = await generateSummary(fileContents[originalFilename]);
            fileSummaries[originalFilename] = "Skipped to save time!"
            console.log(`Summary Created`)
        }

        const chunks = await textSplitter(fileContents, 6000, 500);
        console.log("Text Chunks Created!")
        
        for(const chunk of chunks){
            let vector = {
                brain_name : brainName,
                brain_id : brainId,
                filename : chunk.metadata.filename,
                text : chunk.pageContent,
                embedding : await embedAzureOpenAI(chunk.pageContent)
            };
            await createVectors(vector);
        }
        console.log("Vectors Created in DB!")

        // console.log("finalChunks[",chunks[0]);
        // await saveLocalJson(chunks);
        // await upsertEmbeddingsPinecone(chunks);
        
        await deleteFolderFiles(path.join(__dirname, '../uploads/'));
        console.log('Files Deleted Successfully');
        res.status(200).json({ message: 'Files processed Succesfully!', summaries:fileSummaries, chunks: chunks });

    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).json({ error: 'Error processing files' });
    }
};

module.exports = { RAGchatbot, uploadUserFile }