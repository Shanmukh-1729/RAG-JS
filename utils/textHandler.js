require('dotenv').config();

const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const RecursiveCharacterTextSplitter = require('@langchain/textsplitters').RecursiveCharacterTextSplitter;
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { error } = require('console');
const mammoth = require('mammoth');
const textract = require('textract');

// import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const extractTextFromPDF = async (pdfPath) => {
    // Read the PDF file
    const dataBuffer = fs.readFileSync(pdfPath);

    try {
        // Parse the PDF file
        const data = await pdfParse(dataBuffer);
        // Return extracted text
        return data.text;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error('Failed to extract text from PDF');
    }
};

// Function to extract text from DOCX
const extractFromDOCX = async (filePath)=>  {
    const data = await mammoth.extractRawText({ path: filePath });
    return data.value;
}

// Function to extract text from other formats (DOC, PPT, PPTX)
const extractFromOtherFormats = async (filePath)=> {
    return new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, (error, text) => {
            if (error) {
                reject(error);
            } else {
                resolve(text);
            }
        });
    });
}

const extractText = async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.pdf') {
            return await extractTextFromPDF(filePath);
        } else if (ext === '.docx') {
            return await extractFromDOCX(filePath);
        } else if (ext === '.doc' || ext === '.ppt' || ext === '.pptx') {
            return await extractFromOtherFormats(filePath);
        } else {
            throw new Error('Unsupported file format');
        }
    } catch (error) {
        throw new Error(`Error extracting text: ${error.message}`);
    }
}

const textSplitter = async (textDict, chunk_size = 6000, overlap = 500) => {
    const finalChunks = []
    for (const key in textDict) {
        if (textDict.hasOwnProperty(key)) {
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: chunk_size,
                chunkOverlap: overlap,
            });
            const output = await splitter.createDocuments([textDict[key]]);
            // Map the output to include filename metadata
            const chunksWithFilename = output.map(chunk => ({
                ...chunk,
                metadata: { filename: key }
            }));
            finalChunks.push(...chunksWithFilename);
        }
    }
    return finalChunks;
}

const deleteFolderFiles = async (folderPath) => {
    fs.readdir(folderPath, (err, files) => {
        if (err) throw err;
        files.forEach(file => {
            fs.unlink(path.join(folderPath, file), err => {
                if (err) throw err;
            });
        });
    });
}

const embedAzureOpenAI = async (text) => {
    try {
        const response = await axios.post(
            `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_EMBED_MODEL}/embeddings?api-version=2023-05-15`,
            { input: text },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.AZURE_OPENAI_API_KEY
                }
            }
        )
        return response.data.data[0].embedding;
    } catch (error) {
        console.error('Error Creating embeddings:', error);
        throw new Error('Failed to create embeddings');
    }
}

const upsertToPinecone = async (embedding, pdfName, text, indx) => {
    const upsertRequest = {
        vectors: [{
            pdfName: pdfName,
            values: embedding,
            text: text
        }]
    }
    await indx.upsert({ upsertRequest });
}

const uploadTextToPinceCone = async (chunks) => {

    indxName = process.env.PINECONE_INDEX_NAME;
    console.log(indxName);

    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY
    });

    indices = pc.listIndexes().indexes;

    if (indices) {
        for (let i = 0; i < indices.length; i++) {
            if (indices[i].name === indxName) {
                await pc.deleteIndex(process.env.PINECONE_INDEX_NAME);
                break;
            }
        }
    }
    await pc.createIndex({
        name: process.env.PINECONE_INDEX_NAME,
        dimension: 1536,
        spec: {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
            },
        },
        waitUntilReady: true,
    });

    const indx = pc.index(indxName);

    for (let i = 0; i < chunks.length; i++) {
        const { pageContent, filename } = chunks[i];
        const embedding = await embedAzureOpenAI(pageContent);
        await upsertToPinecone(embedding, filename, pageContent, indx)
    }
    console.log('Files are uploaded to pinecone')
}

const saveLocalJson = async (chunks) => {
    const finalData = []
    for (let i = 0; i < chunks.length; i++) {
        const { pageContent, metadata } = chunks[i];
        const embedding = await embedAzureOpenAI(pageContent);
        finalData.push({
            'filename': metadata.filename,
            'text': pageContent,
            'embedding': embedding
        })
    }
    const vectorIndexes = {
        "index": finalData
    }
    // console.log(finalData[0]);
    // Convert dictionary to JSON string
    const jsonString = JSON.stringify(vectorIndexes, null, 2); // Pretty print with 2 spaces

    // Define the file path
    const filePath = './vectorChunks.json';

    // Write JSON string to a file
    fs.writeFile(filePath, jsonString, (err) => {
        if (err) {
            console.error('Error writing file:', err);
        } else {
            console.log('JSON data has been saved to', filePath);
        }
    });
    console.log('Files are locally saved');
};

const readJson = async (filePath) => {
    try {
        // Read the JSON file
        const data = await fs.promises.readFile(filePath, 'utf8');

        // Parse the JSON data
        const jsonData = JSON.parse(data);
        return jsonData.index; // Return the desired property
    } catch (err) {
        console.error('Error reading or parsing file:', err);
        return null; // or handle the error as needed
    }
};

const cosineSimilarity = (vecA, vecB) => {
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (normA * normB);
};

const fetchTopK = async (queryEmbedding, topK,minSimmilarity) => {

    const filePath = './vectorChunks.json';
    vectorIndexes = await readJson(filePath);
    if (!vectorIndexes) {
        throw new Error('Failed to open vectore indexes!');
    }

    const results = vectorIndexes
        .filter(item => cosineSimilarity(queryEmbedding, item.embedding) > minSimmilarity)
        .map(item => ({
            filename: item.filename,
            text: item.text,
            similarity: cosineSimilarity(queryEmbedding, item.embedding),
    }));

    // Sort by similarity in descending order
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top k results
    return results.slice(0, topK);
}

const chatModelRequest = async (prompt) => {
    const endpoint = `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_CHAT_MODEL}/chat/completions?api-version=2023-05-15`;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    try {
        const response = await axios.post(
            endpoint,
            {
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2
            }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
            }
        }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error Calling Azure OpenAI:', error.response ? error.response.data : error.message);
        throw error;
    }
}

const answerUserQuery = async (userQuery, topChunks) => {

    let contexts = '';
    let filenames = [];
    topChunks.forEach(chunk => {
        if (chunk.text) {
            contexts += chunk.text + "\n\n"; // Concatenate text with new lines
        }
        // console.log(chunk);
        // Check if chunk.filename exists
        if (chunk.filename && !filenames.includes(chunk.filename)) {
            filenames.push(chunk.filename); // Add unique filenames
        }
    });
    // console.log(contexts,filenames)
    const prompt = `### Context
        ${contexts}

        ### User Query
        ${userQuery}

        ### Instructions
        Using the provided context, answer the user query in a clear and concise manner. If the answer is not explicitly found in the context, provide a reasonable inference or clarification based on your knowledge.
    `
    const answer = await chatModelRequest(prompt);
    // console.log(answer,filenames);
    return { answer, filenames, topChunks };
}

const generateSummary = async (textData) => {
    const prompt = `Give a brief summary of the below text extracted from a pdf document. Write it in a way that it represents the whole summary of the document.
        Text - <<${textData}>>
        Give point wise summary with well formatted structure.`
    const summary = await chatModelRequest(prompt);
    return summary;
}

module.exports = { extractTextFromPDF, textSplitter, deleteFolderFiles, uploadTextToPinceCone, saveLocalJson, fetchTopK, embedAzureOpenAI, answerUserQuery, generateSummary, extractText }