// Trivia Solver Worker — uses Cloudflare Workers AI to answer game trivia
// Deploy: cd trivia-worker && npx wrangler deploy

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS });
		}
		if (request.method !== "POST") {
			return Response.json({ error: "POST only" }, { status: 405, headers: CORS });
		}

		try {
			const { question, imageId } = await request.json();
			if (!question) {
				return Response.json({ error: "No question" }, { status: 400, headers: CORS });
			}

			let answer;

			if (imageId) {
				// Fetch image from Roblox CDN
				const assetResp = await fetch(
					`https://assetdelivery.roblox.com/v1/assetId/${imageId}`
				);
				const assetData = await assetResp.json();
				if (!assetData.location) {
					return Response.json({ error: "Could not fetch Roblox asset" }, { status: 400, headers: CORS });
				}

				const imageResp = await fetch(assetData.location);
				const imageBuffer = await imageResp.arrayBuffer();

				const result = await env.AI.run(
					"@cf/meta/llama-3.2-11b-vision-instruct",
					{
						messages: [
							{
								role: "user",
								content: [
									{
										type: "text",
										text: `Look at this image and answer the following trivia question. Give ONLY the answer, nothing else. Be as concise as possible.\n\nQuestion: ${question}`,
									},
									{
										type: "image",
										image: [...new Uint8Array(imageBuffer)],
									},
								],
							},
						],
						max_tokens: 150,
					}
				);
				answer = result.response;
			} else {
				// Text-only question
				const result = await env.AI.run(
					"@cf/meta/llama-3.1-8b-instruct",
					{
						messages: [
							{
								role: "system",
								content:
									"You are a trivia answer bot. Rules:\n" +
									"- For true/false questions: Start with TRUE or FALSE in caps, then one short sentence why.\n" +
									"- For all other questions: Give ONLY the direct answer, no filler.\n" +
									"- Never say 'I think' or 'I believe'. Just state the answer.\n" +
									"- Keep responses under 2 sentences max.",
							},
							{ role: "user", content: question },
						],
						max_tokens: 150,
					}
				);
				answer = result.response;
			}

			return Response.json({ answer }, { headers: CORS });
		} catch (err) {
			return Response.json({ error: err.message }, { status: 500, headers: CORS });
		}
	},
};
