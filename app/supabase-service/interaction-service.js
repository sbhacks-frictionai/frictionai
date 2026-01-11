import { createClient } from "@/lib/supabase/client";

export const getInteractionService = () => {
	const supabase = createClient();

	return {
		/**
		 * Get all interactions for a given document ID
		 * @param {string} documentId - The document UUID
		 * @returns {Promise<Array>} Array of interactions ordered by created_at
		 */
		getInteractionsByDocumentId: async (documentId) => {
			// First get all chunk IDs for this document
			const { data: chunks, error: chunksError } = await supabase
				.from("chunks")
				.select("id")
				.eq("document_id", documentId);

			if (chunksError) throw chunksError;
			if (!chunks || chunks.length === 0) return [];

			const chunkIds = chunks.map((chunk) => chunk.id);

			// Then get interactions for those chunks
			const { data, error } = await supabase
				.from("interactions")
				.select("*")
				.in("chunk_id", chunkIds)
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data;
		},

		/**
		 * Get interactions for a specific page of a document
		 * @param {string} documentId - The document UUID
		 * @param {number} pageNumber - The page number (1-indexed)
		 * @returns {Promise<Array>} Array of interactions for the specified page
		 */
		getInteractionsByPage: async (documentId, pageNumber) => {
			// First get all chunk IDs for this document and page
			const { data: chunks, error: chunksError } = await supabase
				.from("chunks")
				.select("id")
				.eq("document_id", documentId)
				.eq("page_number", pageNumber);

			if (chunksError) throw chunksError;
			if (!chunks || chunks.length === 0) return [];

			const chunkIds = chunks.map((chunk) => chunk.id);

			// Then get interactions for those chunks, filtered by page_number
			const { data, error } = await supabase
				.from("interactions")
				.select("*")
				.in("chunk_id", chunkIds)
				.eq("page_number", pageNumber)
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data;
		},

		/**
		 * Get interactions for a specific chunk
		 * @param {string} chunkId - The chunk UUID
		 * @returns {Promise<Array>} Array of interactions for the specified chunk
		 */
		getInteractionsByChunkId: async (chunkId) => {
			const { data, error } = await supabase
				.from("interactions")
				.select("*")
				.eq("chunk_id", chunkId)
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data;
		},
	};
};
