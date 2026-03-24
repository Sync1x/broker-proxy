const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors()); // Allow requests from any origin (your frontend)
app.use(express.json());

// Health check — Railway/Render ping this to keep the server alive
app.get('/', (req, res) => res.send('Broker OS Proxy — Running'));

// MLS Proxy endpoint
// Frontend sends: { url, user, key, area }
// Server fetches from PrimeMLS and returns listings
app.post('/mls-sync', async (req, res) => {
  const { url, user, key, area, top = 50 } = req.body;

  if (!url || !user || !key) {
    return res.status(400).json({ error: 'Missing url, user, or key' });
  }

  try {
    // Build filter for area if provided
    let filter = "StandardStatus eq 'Active'";
    if (area) {
      filter += ` and (contains(City,'${area}') or contains(CountyOrParish,'${area}') or contains(StateOrProvince,'${area}'))`;
    }

    const endpoint = `${url.replace(/\/$/, '')}/Property?$top=${top}&$filter=${encodeURIComponent(filter)}&$select=ListingId,UnparsedAddress,ListPrice,BedroomsTotal,BathroomsFullCount,StandardStatus,WaterBodyName,WaterfrontYN,ViewYN,ListingFeatures,City,CountyOrParish,PublicRemarks`;

    const mlsRes = await fetch(endpoint, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64'),
        'Accept': 'application/json',
      },
    });

    if (!mlsRes.ok) {
      const errText = await mlsRes.text();
      return res.status(mlsRes.status).json({ error: `MLS returned ${mlsRes.status}`, detail: errText });
    }

    const data = await mlsRes.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: 'Proxy fetch failed', detail: err.message });
  }
});

// Test connection endpoint — just pulls 1 listing to verify credentials
app.post('/mls-test', async (req, res) => {
  const { url, user, key } = req.body;
  if (!url || !user || !key) return res.status(400).json({ error: 'Missing fields' });

  try {
    const endpoint = `${url.replace(/\/$/, '')}/Property?$top=1&$select=ListingId,UnparsedAddress,ListPrice`;
    const mlsRes = await fetch(endpoint, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64'),
        'Accept': 'application/json',
      },
    });
    if (!mlsRes.ok) return res.status(mlsRes.status).json({ error: 'Invalid credentials or URL' });
    const data = await mlsRes.json();
    res.json({ success: true, sample: data.value?.[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Broker OS Proxy running on port ${PORT}`));
