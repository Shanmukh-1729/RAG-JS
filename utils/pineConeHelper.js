const { Pinecone } = require('@pinecone-database/pinecone');
const crypto = require('crypto');


async function initializePinecone(apiKey, environment, indexName, dimension = 1536) {
    try {
        // Initialize Pinecone client
        const pinecone = new Pinecone({
            apiKey
        });
        // await pinecone.init({
        //     apiKey,
        //     environment
        // });

        // List existing indexes
        const existingIndexes = await pinecone.listIndexes();
        // const indexExists = existingIndexes.some(index => index.name === indexName);
        const indexExists = existingIndexes.indexes?.some(index => index.name === indexName);

        if (!indexExists) {
            // Create new index if it doesn't exist
            console.log(`Creating new index: ${indexName}`);
            await pinecone.createIndex({
                name: indexName,
                dimension,
                metric: 'cosine',
                spec: {
                    pod: {
                        environment: 'gcp-starter',
                        podType: 'p1.x1',
                        pods: 1,
                        replicas: 1
                    }
                }
            });
            
            // Wait for index to be ready
            await waitForIndexToBeReady(pinecone, indexName);
        } else {
            console.log(`Index ${indexName} already exists`);
        }

        // Get the index instance
        const indx =  pinecone.Index(indexName);
        indexStats = await indx.describeIndexStats();
        console.log("Describe Index",indexStats);

        // await deleteVectors(index);

        // Clear all vectors from the index
        console.log('Clearing all vectors from the index...');
        await indx.namespace(' ').deleteAll();
        // await indx.delete1({
        //     deleteAll: true,
        //     namespace: '' // Specify the namespace if required, otherwise leave it empty
        // });
        console.log('Index is ready for use!');
        return indx;
    } catch (error) {
        console.error('Error during Pinecone initialization:', error);
        throw error;
    }
}

async function waitForIndexToBeReady(pinecone, indexName) {
    while (true) {
        const description = await pinecone.describeIndex(indexName);
        if (description.status.ready) {
            break;
        }
        console.log('Waiting for index to be ready...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Function to generate a unique ID
function generateUniqueId() {
    return crypto.randomBytes(16).toString('hex');
}

// Function to batch array into chunks
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function upsertToPinecone(index, documents) {
    try {
        // Batch size for upserting (Pinecone recommends 100 vectors per batch)
        const BATCH_SIZE = 100;

        // Format documents into Pinecone vector format
        const vectors = documents.map(doc => ({
            id: generateUniqueId(),
            values: doc.embedding,
            metadata: {
                text: doc.text,
                filename: doc.filename
            }
        }));

        // Split vectors into batches
        const batches = chunkArray(vectors, BATCH_SIZE);

        console.log(`Upserting ${vectors.length} vectors in ${batches.length} batches...`);

        // Upsert each batch
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(i,batch);
            await index.upsert({
                vectors: batch
            });
            console.log(`Completed batch ${i + 1}/${batches.length}`);
        }

        console.log('Successfully upserted all vectors to Pinecone');
        return true;
    } catch (error) {
        console.error('Error upserting to Pinecone:', error);
        throw error;
    }
}

async function similaritySearch(index, queryEmbedding, topK = 5, includeMetadata = true) {
    try {
        // Perform the query
        const queryResponse = await index.query({
            vector: queryEmbedding,
            topK,
            includeMetadata
        });

        // Format the results
        const results = queryResponse.matches.map(match => ({
            score: match.score,
            text: match.metadata.text,
            filename: match.metadata.filename,
            id: match.id
        }));

        return results;
    } catch (error) {
        console.error('Error performing similarity search:', error);
        throw error;
    }
}

async function upsertEmbeddingsPinecone(documents){
    const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
    const PINECONE_ENVIRONMENT =process.env.PINECONE_ENVIRONMENT;
    const INDEX_NAME = process.env.PINECONE_INDEX_NAME;

    try{
        const index = await initializePinecone(PINECONE_API_KEY,PINECONE_ENVIRONMENT,INDEX_NAME);
        // Upsert documents
        await upsertToPinecone(index, documents);
    }catch (error) {
        console.error('Error in Uploading Chunks to pinecone:', error);
        throw error;
    }
}

async function fetchTopKPinecone(queryEmbedding,topK,similarityCut) {

    const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
    const PINECONE_ENVIRONMENT =process.env.PINECONE_ENVIRONMENT;
    const INDEX_NAME = process.env.PINECONE_INDEX_NAME;

    try{
        const index = await initializePinecone(PINECONE_API_KEY,PINECONE_ENVIRONMENT,INDEX_NAME);
        const searchResults = await similaritySearch(index, queryEmbedding, topK);
        return searchResults;
    }catch(error){
        console.error("Error in fetching top k chunks:",error);
    }
}

module.exports = { initializePinecone, upsertToPinecone, similaritySearch, upsertEmbeddingsPinecone, fetchTopKPinecone};