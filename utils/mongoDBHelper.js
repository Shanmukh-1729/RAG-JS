const Brain = require("../models/brainModel") 
// const connectDB = require("../config/database")

const createVectors = async (brainData) =>{
    try{
        // await connectDB();

        const filter = brainData;
        const options = {upsert:true,new:true};
        const brain = await Brain.findOneAndUpdate(filter, brainData, options);
        return brain;
        // await brain.save();
    }catch(err){
        console.error(err);
        throw err;
    }
}

function cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, value, index) => sum + value * vec2[index], 0);
    const normA = Math.sqrt(vec1.reduce((sum, value) => sum + value * value, 0));
    const normB = Math.sqrt(vec2.reduce((sum, value) => sum + value * value, 0));
    return dotProduct / (normA * normB);
}

const fetchTopKDocuments = async (brain_id, queryEmbedding, similarityCutoff, K) => {
    try {
      const results = await Brain.find({ brain_id:brain_id });
        // const results = await Brain.find();
        // console.log(results)
        const filteredResults = results
        .map((doc) => {
            const similarity = cosineSimilarity(doc.embedding, queryEmbedding);
            return { ...doc._doc, similarity }; // Keep the original document data and add similarity
        })
        .filter((doc) => doc.similarity >= similarityCutoff) // Filter based on cosine similarity cutoff
        .sort((a, b) => b.similarity - a.similarity) // Sort by similarity in descending order
        .slice(0, K); // Take top K

        return filteredResults;
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
};

//  Using VectorSearch Aggregation
// const fetchTopKDocuments = async (brain_id, queryEmbedding, similarityCutoff, topK) => {
//     try {
//       const result = await Brain.aggregate([
//         {
//           $match: {
//             brainId: brain_id
//           }
//         },
//         {
//           $vectorSearch: {
//             index: "vector_index", // Make sure this is the name of the index
//             queryVector: queryEmbedding,
//             limit: topK,
//             // numCandidates: 100,  // Optional: Controls how many documents to consider before filtering
//             similarityThreshold: similarityCutoff,
//             path: "embedding"
//           }
//         }
//       ]);
//       console.log(result)
//       return result;
//     } catch (error) {
//       console.error("Error in vector search:", error);
//     }
// };

// const fetchTopK = async (embedding,topK,cutoff) => {

// }

module.exports = {createVectors,fetchTopKDocuments};