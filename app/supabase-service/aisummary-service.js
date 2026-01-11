import { createClient } from "@/lib/supabase/client";

export const getAiSummaryService = () => {
	const supabase = createClient();

	return {
		/**
		 * Generate an AI study guide for a document
		 * @param {string} documentId - The document UUID
		 * @returns {Promise<Object>} Object containing the study guide and metadata
		 */
		generateStudyGuide: async (documentId) => {
			if (!documentId) {
				throw new Error("Document ID is required");
			}

			// Get the current session and access token
			const {
				data: { session },
				error: sessionError,
			} = await supabase.auth.getSession();

			if (sessionError) {
				throw new Error(
					`Authentication error: ${sessionError.message}`
				);
			}

			if (!session) {
				throw new Error(
					"Authentication required. Please log in to generate a study guide."
				);
			}

			// Build headers with explicit authorization
			const headers = {
				"Content-Type": "application/json",
			};

			// Include authorization header if we have a session
			if (session.access_token) {
				headers["Authorization"] = `Bearer ${session.access_token}`;
			}

			const { data, error } = await supabase.functions.invoke(
				"getaiguide",
				{
					body: JSON.stringify({ document_id: documentId }),
					headers,
				}
			);

			if (error) {
				console.error("Edge function error:", error);
				throw error;
			}

			return data;
		},
	};
};
