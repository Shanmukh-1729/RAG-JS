require('dotenv').config();

const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const RecursiveCharacterTextSplitter = require('@langchain/textsplitters').RecursiveCharacterTextSplitter;
const axios = require('axios');
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

const rephraseQuestion = async (history, question) => {
    // console.log(history);
    const opFormat = "#json{'question':'modified question'}#"
    const prompt = `Based on the conversation history and the user's question, modify or enhance the question if it relates to previous answers or questions.\
    If the question is a follow-up, rephrase it so it stands alone. If the question is unrelated to the previous conversation, keep it as is and output it without modifications.\
    Please strictly follow the output format and do not include any additional text.
    
    Conversation History - ${JSON.stringify(history)} 
    User Question - ${question}
    
    Output Format - ${opFormat}
    `
    // console.log("Prompt",prompt);
    const modelResp = await chatModelRequest(prompt);

    const regex = /#json(.*?)#/;

    // Match the JSON part of the string
    const match = modelResp.match(regex);
    
    if (match) {
        try {
            // Extract the JSON string and parse it
            const jsonString = match[1].trim();
            const jsonObject = JSON.parse(jsonString.replace(/'/g, '"')); // Replace single quotes with double quotes for valid JSON
            // console.log(jsonObject);
            return jsonObject;
        } catch (error) {
            console.error("Invalid JSON format:", error);
        }
    } else {
        console.log("No JSON found in the string.");
    }
}

module.exports = { extractTextFromPDF, textSplitter, deleteFolderFiles, embedAzureOpenAI, answerUserQuery, generateSummary, extractText, rephraseQuestion }