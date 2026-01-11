import { createClient } from "@/lib/supabase/client";

export const getExplanationService = () => {
	const supabase = createClient();

	return {
		/**
		 * Get AI explanation for a specific chunk
		 * @param {string} chunkId - The chunk UUID
		 * @param {string} detailLevel - Level of detail: "brief", "normal", or "detailed"
		 * @param {number} contextRadius - Number of surrounding chunks to include for context (default: 2)
		 * @returns {Promise<Object>} AI explanation response
		 */
		explainChunk: async (chunkId, detailLevel = "detailed", contextRadius = 2) => {
			const { data, error } = await supabase.functions.invoke('chunk-explain', {
				body: {
					chunk_id: chunkId,
					detail_level: detailLevel,
					context_radius: contextRadius,
				},
			});

			// Check for transport-level errors
			if (error) throw error;
			
			// Check for application-level errors (success: false in response)
			if (data && !data.success && data.error) {
				throw new Error(data.error);
			}
			
			return data;
		},

		/**
		 * Record a chunk interaction (increments interaction count)
		 * @param {string} chunkId - The chunk UUID
		 * @param {string} userId - The user ID (use "anon" for anonymous users)
		 * @param {number} pageNumber - The page number where the chunk is located
		 * @returns {Promise<void>}
		 */
		recordInteraction: async (chunkId, userId = "anon", pageNumber) => {
			const { error } = await supabase.rpc("increment_chunk_interaction", {
				p_chunk_id: chunkId,
				p_user_id: userId,
				p_page_number: pageNumber,
			});

			if (error) throw error;
		},

		/**
		 * Generate a study guide for a document based on hot zones
		 * @param {string} documentId - The document UUID
		 * @param {string} userId - The user ID (use "anon" for anonymous users)
		 * @param {number} topN - Number of top hot zones to include (default: 5)
		 * @returns {Promise<Object>} Study guide response
		 */
		generateStudyGuide: async (documentId, userId = "anon", topN = 5) => {
			const { data, error } = await supabase.functions.invoke('generate-study-guide', {
				body: {
					document_id: documentId,
					user_id: userId,
					top_n: topN,
				},
			});

			if (error) throw error;
			return data;
		},
	};
};
