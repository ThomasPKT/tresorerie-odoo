// netlify/functions/filters.js
const { odooSearch, delay, respond, corsHeaders } = require('./_odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const { odooUrl, db, uid, apiKey } = JSON.parse(event.body);
    const companies = await odooSearch(odooUrl, db, uid, apiKey, 'res.company', [], ['name'], 100);
    await delay(300);
    const journals = await odooSearch(odooUrl, db, uid, apiKey, 'account.journal', [['type','in',['bank','cash']]], ['name','company_id'], 100);
    return respond(200, { companies, journals });
  } catch(e) {
    return respond(502, { error: e.message });
  }
};
