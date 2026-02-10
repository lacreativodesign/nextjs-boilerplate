const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

type SmsParams = {
  to: string;
  message: string;
  from?: string;
};

function hasTwilioConfig() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

export async function sendSMS(params: SmsParams) {
  if (!hasTwilioConfig()) {
    throw new Error("Twilio SMS configuration missing.");
  }

  const from = params.from || TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("Twilio from number is not configured.");
  }

  const body = new URLSearchParams({
    To: params.to,
    From: from,
    Body: params.message,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Twilio send failed: ${response.status} ${responseBody}`);
  }
}
