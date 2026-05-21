// netlify/functions/login.js
// Vérifie le mot de passe et retourne les identifiants Odoo depuis les variables d'environnement

const { xmlrpcCall, respond, corsHeaders } = require('./_odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const { password } = JSON.parse(event.body);

    // Vérification du mot de passe
    const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
    if (!DASHBOARD_PASSWORD) return respond(500, { error: 'Configuration manquante sur le serveur.' });
    if (password !== DASHBOARD_PASSWORD) return respond(401, { error: 'Mot de passe incorrect.' });

    // Récupération des identifiants Odoo depuis les variables d'environnement
    const odooUrl = process.env.ODOO_URL;
    const email = process.env.ODOO_EMAIL;
    const apiKey = process.env.ODOO_API_KEY;

    if (!odooUrl || !email || !apiKey) return respond(500, { error: 'Identifiants Odoo non configurés sur le serveur.' });

    // Authentification Odoo
    const db = odooUrl.split('.')[0];
    const uid = await xmlrpcCall(odooUrl, '/xmlrpc/2/common', 'authenticate', [db, email, apiKey, {}]);
    if (!uid || uid === false || uid === 0) return respond(502, { error: 'Connexion Odoo impossible. Vérifiez les identifiants serveur.' });

    return respond(200, { uid, db, odooUrl, apiKey });
  } catch(e) {
    return respond(502, { error: 'Erreur : ' + e.message });
  }
};
