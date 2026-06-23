import axios from "axios";

export interface ConnectionResult {
  connected: boolean;
  username?: string;
  error?: string;
}

export async function testTwitterConnection(bearerToken: string): Promise<ConnectionResult> {
  if (!bearerToken.trim()) return { connected: false, error: "No token provided" };
  try {
    const res = await axios.get("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    return { connected: true, username: res.data?.data?.username };
  } catch (e: any) {
    return { connected: false, error: e?.response?.data?.detail ?? e?.message };
  }
}

export async function testInstagramConnection(accessToken: string): Promise<ConnectionResult> {
  if (!accessToken.trim()) return { connected: false, error: "No token provided" };
  try {
    const res = await axios.get(
      `https://graph.instagram.com/v22.0/me?fields=id,username&access_token=${accessToken}`
    );
    return { connected: true, username: res.data?.username };
  } catch (e: any) {
    return { connected: false, error: e?.response?.data?.error?.message ?? e?.message };
  }
}

export async function testYouTubeConnection(apiKey: string): Promise<ConnectionResult> {
  if (!apiKey.trim()) return { connected: false, error: "No key provided" };
  try {
    const res = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&key=${apiKey}`
    );
    const title = res.data?.items?.[0]?.snippet?.title;
    return { connected: true, username: title };
  } catch (e: any) {
    return { connected: false, error: e?.response?.data?.error?.message ?? e?.message };
  }
}

export async function testGumroadConnection(accessToken: string): Promise<ConnectionResult> {
  if (!accessToken.trim()) return { connected: false, error: "No token provided" };
  try {
    const res = await axios.get(
      `https://api.gumroad.com/v2/user?access_token=${accessToken}`
    );
    return { connected: res.data?.success, username: res.data?.user?.name };
  } catch (e: any) {
    return { connected: false, error: e?.response?.data?.message ?? e?.message };
  }
}

export async function testMailchimpConnection(apiKey: string): Promise<ConnectionResult> {
  if (!apiKey.trim()) return { connected: false, error: "No key provided" };
  const dc = apiKey.split("-").pop() ?? "us1";
  try {
    const res = await axios.get(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      headers: {
        Authorization: `Basic ${btoa(`anystring:${apiKey}`)}`,
      },
    });
    return { connected: res.data?.health_status === "Everything's Chimpy!", username: "Mailchimp" };
  } catch (e: any) {
    return { connected: false, error: e?.response?.data?.detail ?? e?.message };
  }
}

export async function postTweet(text: string, bearerToken: string): Promise<{ id: string }> {
  if (!bearerToken.trim()) throw new Error("Twitter Bearer Token not configured");
  const res = await axios.post(
    "https://api.twitter.com/2/tweets",
    { text },
    { headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" } }
  );
  if (!res.data?.data?.id) throw new Error("Tweet failed — no ID returned");
  return { id: res.data.data.id };
}

export async function postInstagramMedia(
  imageUrl: string,
  caption: string,
  accessToken: string,
  igUserId: string
): Promise<{ id: string }> {
  if (!accessToken.trim()) throw new Error("Instagram access token not configured");
  const containerRes = await axios.post(
    `https://graph.instagram.com/v22.0/${igUserId}/media`,
    { image_url: imageUrl, caption, access_token: accessToken }
  );
  const containerId = containerRes.data?.id;
  if (!containerId) throw new Error("Failed to create Instagram media container");
  const publishRes = await axios.post(
    `https://graph.instagram.com/v22.0/${igUserId}/media_publish`,
    { creation_id: containerId, access_token: accessToken }
  );
  return { id: publishRes.data?.id };
}

export async function createMailchimpCampaign(
  apiKey: string,
  listId: string,
  subject: string,
  htmlContent: string
): Promise<{ id: string }> {
  if (!apiKey.trim()) throw new Error("Mailchimp API key not configured");
  const dc = apiKey.split("-").pop() ?? "us1";
  const headers = { Authorization: `Basic ${btoa(`anystring:${apiKey}`)}` };
  const campaignRes = await axios.post(
    `https://${dc}.api.mailchimp.com/3.0/campaigns`,
    { type: "regular", recipients: { list_id: listId }, settings: { subject_line: subject, from_name: "AI Agent", reply_to: "noreply@example.com" } },
    { headers }
  );
  const campaignId = campaignRes.data?.id;
  if (!campaignId) throw new Error("Failed to create Mailchimp campaign");
  await axios.put(
    `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}/content`,
    { html: htmlContent },
    { headers }
  );
  return { id: campaignId };
}

export async function createGumroadProduct(
  accessToken: string,
  name: string,
  description: string,
  priceInCents: number
): Promise<{ id: string; permalink: string }> {
  if (!accessToken.trim()) throw new Error("Gumroad access token not configured");
  const res = await axios.post(`https://api.gumroad.com/v2/products`, {
    access_token: accessToken,
    name,
    description,
    price: priceInCents,
  });
  if (!res.data?.success) throw new Error(res.data?.message ?? "Failed to create Gumroad product");
  return { id: res.data.product.id, permalink: res.data.product.short_url };
}
