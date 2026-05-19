// Netlify serverless function: handles contact form submissions
// Sends data to Notion database + MailerLite (if subscribed)

exports.handler = async (event) => {
  // CORS headers for cross-origin requests from GitHub Pages
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { name, email, company, lookingFor, message, mailingList } = JSON.parse(event.body);

    // Validate required fields
    if (!name || !email || !message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Name, email, and message are required." }) };
    }

    // ===== 1. SEND TO NOTION =====
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Name: { title: [{ text: { content: name } }] },
          Email: { email: email },
          Company: { rich_text: [{ text: { content: company || "" } }] },
          "Looking For": lookingFor ? { select: { name: lookingFor } } : undefined,
          Message: { rich_text: [{ text: { content: message } }] },
          "Date Received": { date: { start: new Date().toISOString().split("T")[0] } },
          "Lead Status": { select: { name: "New" } },
          Priority: { select: { name: "Medium" } },
          "Subscribed to List": { checkbox: mailingList ? true : false },
        },
      }),
    });

    if (!notionRes.ok) {
      const err = await notionRes.text();
      console.error("Notion error:", err);
    }

    // ===== 2. ADD TO MAILERLITE (all submitters for confirmation email) =====
    const groups = [process.env.MAILERLITE_FORM_GROUP_ID];
    if (mailingList) {
      groups.push(process.env.MAILERLITE_GROUP_ID);
    }

    const mlRes = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: email,
        fields: { name: name, company: company || "", looking_for: lookingFor || "", message: message || "" },
        groups: groups,
      }),
    });

    if (!mlRes.ok) {
      const err = await mlRes.text();
      console.error("MailerLite error:", err);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Form submitted successfully." }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Something went wrong. Please try again." }),
    };
  }
};
