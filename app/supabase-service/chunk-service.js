import { createClient } from "@/lib/supabase/client";

export const getChunkService = () => {
	const supabase = createClient();

	return {
		/**
		 * Get all chunks for a given document ID
		 * @param {string} documentId - The document UUID
		 * @returns {Promise<Array>} Array of chunks ordered by page number and chunk index
		 */
		getChunksByDocumentId: async (documentId) => {
			const { data, error } = await supabase
				.from("chunks")
				.select("*")
				.eq("document_id", documentId)
				.order("page_number", { ascending: true })
				.order("chunk_index", { ascending: true });

			if (error) throw error;
			return data;
		},

		/**
		 * Get chunks for a specific page of a document
		 * @param {string} documentId - The document UUID
		 * @param {number} pageNumber - The page number (1-indexed)
		 * @returns {Promise<Array>} Array of chunks for the specified page
		 */
		getChunksByPage: async (documentId, pageNumber) => {
			const { data, error } = await supabase
				.from("chunks")
				.select("*")
				.eq("document_id", documentId)
				.eq("page_number", pageNumber)
				.order("chunk_index", { ascending: true });

			if (error) throw error;
			return data;
		},

		/**
		 * Get a single chunk by its ID
		 * @param {string} chunkId - The chunk UUID
		 * @returns {Promise<Object>} The chunk object
		 */
		getChunkById: async (chunkId) => {
			const { data, error } = await supabase
				.from("chunks")
				.select("*")
				.eq("id", chunkId)
				.single();

			if (error) throw error;
			return data;
		},

		/**
		 * Get only text chunks (exclude images) for a document
		 * @param {string} documentId - The document UUID
		 * @returns {Promise<Array>} Array of text chunks
		 */
		getTextChunksByDocumentId: async (documentId) => {
			const { data, error } = await supabase
				.from("chunks")
				.select("*")
				.eq("document_id", documentId)
				.eq("is_image", false)
				.order("page_number", { ascending: true })
				.order("chunk_index", { ascending: true });

			if (error) throw error;
			return data;
		},

		/**
		 * Get only image chunks for a document
		 * @param {string} documentId - The document UUID
		 * @returns {Promise<Array>} Array of image chunks
		 */
		getImageChunksByDocumentId: async (documentId) => {
			const { data, error } = await supabase
				.from("chunks")
				.select("*")
				.eq("document_id", documentId)
				.eq("is_image", true)
				.order("page_number", { ascending: true })
				.order("chunk_index", { ascending: true });

			if (error) throw error;
			return data;
		},

		incrementChunkCount: async (chunkId) => {
			const { data, error } = await supabase.rpc(
				"increment_chunk",
				{ chunkid: chunkId }
			);
			
			if (error) {
				console.error("Failed to increment:", error);
				return null;
			}
			return data;
		}
	};
};
