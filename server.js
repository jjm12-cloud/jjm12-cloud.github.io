import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();

// ----- ENV -----
const {
  E2PAY_BASE,            // ex.: https://mpesaemolatech.com
  E2PAY_CLIENT_ID,
  E2PAY_CLIENT_SECRET,
  EMOLA_WALLET,          // 995639
  MPESA_WALLET,          // 995638
  ALLOWED_ORIGIN,        // https://xerecapay.com,https://www.xerecapay.com
  PORT = 8080
} = process.env;

// ----- CORS (a partir da env ALLOWED_ORIGIN, separada por vírgulas) -----
const allowList = (ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // permitir chamadas de curl/postman (sem origin)
    if (!origin) return cb(null, true);
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed by CORS"), false);
  }
}));

app.use(express.json());

// Healthcheck
app.get("/health", (req, res) => res.json({ ok: true }));

// Auxiliar: obter access_token
async function getToken() {
  const url = `${E2PAY_BASE}/oauth/token`;
  const body = {
    grant_type: "client_credentials",
    client_id: E2PAY_CLIENT_ID,
    client_secret: E2PAY_CLIENT_SECRET
  };
  const { data } = await axios.post(url, body, {
    headers: { "content-type": "application/json" }
  });
  return data.access_token;
}

// Auxiliar: chamar pagamento
async function callPayment({ wallet, amount, phone, reference }) {
  const token = await getToken();

  let walletId, path;
  if (wallet === "emola") {
    walletId = EMOLA_WALLET;
    path = `/v1/c2b/emola-payment/${walletId}`;
  } else if (wallet === "mpesa") {
    walletId = MPESA_WALLET;
    path = `/v1/c2b/mpesa-payment/${walletId}`;
  } else {
    const err = new Error("wallet inválida. Use 'emola' ou 'mpesa'.");
    err.status = 400;
    throw err;
  }

  const url = `${E2PAY_BASE}${path}`;
  const payload = {
    client_id: E2PAY_CLIENT_ID,
    amount: Number(amount),
    phone: String(phone),
    reference: reference || `REF-${Date.now()}`
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`
    }
  });

  return data;
}

// POST /checkout
app.post("/checkout", async (req, res) => {
  try {
    const { wallet, amount, phone, reference } = req.body;

    if (!wallet || !amount || !phone) {
      return res.status(400).json({
        error: "Campos obrigatórios: wallet, amount, phone"
      });
    }

    const resp = await callPayment({ wallet, amount, phone, reference });
    res.json(resp);
  } catch (err) {
    const status = err.response?.status || err.status || 500;
    const payload = err.response?.data || { error: err.message };
    res.status(status).json(payload);
  }
});

// Start
app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
