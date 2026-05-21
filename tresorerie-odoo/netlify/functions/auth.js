// netlify/functions/auth.js
const { xmlrpcCall, respond, corsHeaders } = require('./_odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const { odooUrl, email, apiKey } = JSON.parse(event.body);
    const db = odooUrl.split('.')[0];
    const uid = await xmlrpcCall(odooUrl, '/xmlrpc/2/common', 'authenticate', [db, email, apiKey, {}]);
    if (!uid || uid === false || uid === 0) return respond(401, { error: 'Identifiants incorrects. Vérifiez votre e-mail et clé API.' });
    return respond(200, { uid, db });
  } catch(e) {
    return respond(502, { error: 'Connexion impossible : ' + e.message });
  }
};
