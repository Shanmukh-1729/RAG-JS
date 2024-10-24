const { Pinecone } = require('@pinecone-database/pinecone');
const { error } = require('console');

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




// const upsertToPinecone = async (embedding, pdfName, text, indx) => {
//     const upsertRequest = {
//         vectors: [{
//             pdfName: pdfName,
//             values: embedding,
//             text: text
//         }]
//     }
//     await indx.upsert({ upsertRequest });
// }

// const uploadTextToPinceCone = async (chunks) => {

//     indxName = process.env.PINECONE_INDEX_NAME;
//     console.log(indxName);

//     const pc = new Pinecone({
//         apiKey: process.env.PINECONE_API_KEY
//     });

//     indices = pc.listIndexes().indexes;

//     if (indices) {
//         for (let i = 0; i < indices.length; i++) {
//             if (indices[i].name === indxName) {
//                 await pc.deleteIndex(process.env.PINECONE_INDEX_NAME);
//                 break;
//             }
//         }
//     }
//     await pc.createIndex({
//         name: process.env.PINECONE_INDEX_NAME,
//         dimension: 1536,
//         spec: {
//             serverless: {
//                 cloud: 'aws',
//                 region: 'us-east-1',
//             },
//         },
//         waitUntilReady: true,
//     });

//     const indx = pc.index(indxName);

//     for (let i = 0; i < chunks.length; i++) {
//         const { pageContent, filename } = chunks[i];
//         const embedding = await embedAzureOpenAI(pageContent);
//         await upsertToPinecone(embedding, filename, pageContent, indx)
//     }
//     console.log('Files are uploaded to pinecone')
// }