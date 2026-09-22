// renderer.js — logique de l'interface (appels API backend LoyerPay)
let API_URL = '';
let GESTIONNAIRE_ID = '';

document.querySelectorAll('#sidebar button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#sidebar button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['dashboard', 'historique', 'solde', 'config'].forEach(v => {
      document.getElementById('view-' + v).style.display = (v === btn.dataset.view) ? 'block' : 'none';
    });
    if (btn.dataset.view === 'dashboard') chargerLocataires();
    if (btn.dataset.view === 'historique') remplirSelectLocataires();
    if (btn.dataset.view === 'solde') { chargerSolde(); chargerHistoriqueRetraits(); }
  });
});

async function init() {
  const deviceId = await window.loyerpay.getDeviceId();
  document.getElementById('device-id').textContent = deviceId;

  API_URL = (await window.loyerpay.storeGet('api_url')) || 'https://loyerpay.hasnemtech.com';
  GESTIONNAIRE_ID = (await window.loyerpay.storeGet('gestionnaire_id')) || '';
  document.getElementById('api-url').value = API_URL;
  document.getElementById('gestionnaire-id').value = GESTIONNAIRE_ID;

  if (!GESTIONNAIRE_ID) return; // pas encore de compte, carte-inscription reste visible

  document.getElementById('carte-inscription').style.display = 'none';

  // Verrouille l'app si un mot de passe a deja ete defini pour ce compte -
  // sinon (comptes crees avant cette fonctionnalite), on laisse passer
  // directement, sans bloquer un utilisateur existant.
  try {
    const res = await fetch(`${API_URL}/api/gestionnaires/moi`, { headers: apiHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (data.mot_de_passe_defini) {
        document.getElementById('verrou-nom').textContent = data.nom;
        document.getElementById('ecran-verrou').style.display = 'flex';
        return; // le reste ne charge qu'apres deverrouillage
      }
    }
  } catch (e) { /* pas de reseau au demarrage - on continue quand meme */ }

  chargerLocataires();
}

async function deverrouiller() {
  const motDePasse = document.getElementById('verrou-mdp').value;
  if (!motDePasse) return alert('Entrez votre mot de passe.');

  const bouton = document.querySelector('#ecran-verrou button.action');
  bouton.disabled = true;
  bouton.textContent = 'Vérification...';

  const controleur = new AbortController();
  const delaiMax = setTimeout(() => controleur.abort(), 15000);

  try {
    const res = await fetch(`${API_URL}/api/gestionnaires/verifier-mdp`, {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ motDePasse }),
      signal: controleur.signal
    });
    const data = await res.json();

    if (data.error === 'compte_bloque') {
      return alert('Compte bloqué après trop de tentatives échouées. Contactez HASNEM pour le débloquer (lien ci-dessous).');
    }
    if (data.error === 'compte_verrouille_temporairement') {
      return alert(`Trop de tentatives échouées. Réessayez dans ${data.minutesRestantes} minute(s), ou contactez HASNEM.`);
    }
    if (!data.ok) {
      const reste = data.tentativesRestantes;
      return alert('Mot de passe incorrect.' + (reste ? ` ${reste} tentative(s) restante(s) avant verrouillage.` : ''));
    }

    document.getElementById('ecran-verrou').style.display = 'none';
    document.getElementById('verrou-mdp').value = '';
    chargerLocataires();
  } catch (e) {
    if (e.name === 'AbortError') {
      alert('Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.');
    } else {
      alert('Erreur réseau - impossible de vérifier le mot de passe sans connexion.');
    }
  } finally {
    clearTimeout(delaiMax);
    bouton.disabled = false;
    bouton.textContent = 'Déverrouiller';
  }
}

async function contacterHasnemMdpOublie() {
  const deviceId = await window.loyerpay.getDeviceId();
  const message = `Bonjour HASNEM, j'ai oublié le mot de passe de mon compte LoyerPay.\n\nMon nom : ${document.getElementById('verrou-nom').textContent}\nMon identifiant appareil : ${deviceId}`;
  window.loyerpay.openExternal(`https://wa.me/22893346814?text=${encodeURIComponent(message)}`);
}

async function changerMotDePasse() {
  const motDePasse = document.getElementById('nouveau-mdp').value;
  if (!motDePasse || motDePasse.length < 4) return alert('Le mot de passe doit faire au moins 4 caractères.');
  const res = await fetch(`${API_URL}/api/gestionnaires/mot-de-passe`, {
    method: 'PUT', headers: apiHeaders(),
    body: JSON.stringify({ motDePasse })
  });
  if (res.ok) { alert('Mot de passe enregistré.'); document.getElementById('nouveau-mdp').value = ''; }
  else alert('Erreur lors de l\'enregistrement.');
}

async function sauvegarderConfig() {
  API_URL = document.getElementById('api-url').value.trim();
  GESTIONNAIRE_ID = document.getElementById('gestionnaire-id').value.trim();
  await window.loyerpay.storeSet('api_url', API_URL);
  await window.loyerpay.storeSet('gestionnaire_id', GESTIONNAIRE_ID);
  alert('Configuration enregistrée.');
  chargerLocataires();
}

// Inscription directe, sans licence ni abonnement - le compte est
// immediatement utilisable des sa creation.
async function creerCompte() {
  const nom = document.getElementById('inscription-nom').value.trim();
  const telephone = document.getElementById('inscription-tel').value.trim();
  const email = document.getElementById('inscription-email').value.trim();
  const motDePasse = document.getElementById('inscription-mdp').value;
  const apiUrl = document.getElementById('api-url').value.trim() || API_URL;
  if (!nom || !telephone || !motDePasse) return alert('Nom, téléphone et mot de passe sont requis.');

  const deviceId = await window.loyerpay.getDeviceId();
  try {
    const res = await fetch(`${apiUrl}/api/gestionnaires`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, telephone, email, deviceId, motDePasse })
    });
    const data = await res.json();
    if (!res.ok) return alert('Erreur : ' + (data.error || 'inconnue'));

    API_URL = apiUrl;
    GESTIONNAIRE_ID = data.id;
    await window.loyerpay.storeSet('api_url', API_URL);
    await window.loyerpay.storeSet('gestionnaire_id', GESTIONNAIRE_ID);
    document.getElementById('gestionnaire-id').value = GESTIONNAIRE_ID;
    document.getElementById('carte-inscription').style.display = 'none';
    alert('Compte créé ! Vous pouvez commencer à ajouter vos locataires.');
    chargerLocataires();
  } catch (e) {
    alert('Erreur réseau : ' + e.message);
  }
}

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'x-gestionnaire-id': GESTIONNAIRE_ID };
}

async function chargerLocataires() {
  if (!API_URL) return;
  try {
    const res = await fetch(`${API_URL}/api/locataires`, { headers: apiHeaders() });
    LOCATAIRES_LISTE = await res.json();
    const tbody = document.querySelector('#table-locataires tbody');
    tbody.innerHTML = '';
    LOCATAIRES_LISTE.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${l.nom}</td>
        <td>${l.telephone}</td>
        <td>${l.montant_loyer.toLocaleString('fr-FR')} FCFA</td>
        <td>
          <button class="action" onclick="demanderPaiement('${l.id}', '${l.telephone}', '${l.nom.replace(/'/g, "\\'")}')">Demander paiement</button>
          <button onclick="modifierLocataire('${l.id}')" style="background:#555;color:#fff;border:none;padding:9px 12px;border-radius:4px;cursor:pointer;margin-left:6px">Modifier</button>
          <button onclick="supprimerLocataire('${l.id}', '${l.nom.replace(/'/g, "\\'")}')" style="background:#c0392b;color:#fff;border:none;padding:9px 12px;border-radius:4px;cursor:pointer;margin-left:6px">Supprimer</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) { console.error(e); }
}

async function supprimerLocataire(id, nom) {
  if (!confirm(`Supprimer ${nom} ? L'historique de paiements sera conservé mais le locataire n'apparaîtra plus dans la liste.`)) return;
  const res = await fetch(`${API_URL}/api/locataires/${id}`, { method: 'DELETE', headers: apiHeaders() });
  if (res.ok) chargerLocataires();
  else alert('Erreur lors de la suppression.');
}

let LOCATAIRES_LISTE = [];
let LOCATAIRE_EN_EDITION = null;

// Remplit le formulaire d'ajout avec les valeurs existantes du locataire,
// et bascule le bouton en mode "modification" - reutilise le meme
// formulaire plutot que d'en dupliquer un second.
function modifierLocataire(id) {
  const l = LOCATAIRES_LISTE.find(x => x.id === id);
  if (!l) return;
  LOCATAIRE_EN_EDITION = id;
  document.getElementById('nom').value = l.nom;
  document.getElementById('tel').value = l.telephone;
  document.getElementById('email').value = l.email || '';
  document.getElementById('montant').value = l.montant_loyer;
  document.getElementById('bouton-ajouter-locataire').textContent = 'Enregistrer les modifications';
  document.getElementById('bouton-annuler-edition').style.display = 'inline-block';
}

function annulerEditionLocataire() {
  LOCATAIRE_EN_EDITION = null;
  document.getElementById('nom').value = '';
  document.getElementById('tel').value = '';
  document.getElementById('email').value = '';
  document.getElementById('montant').value = '';
  document.getElementById('bouton-ajouter-locataire').textContent = 'Ajouter';
  document.getElementById('bouton-annuler-edition').style.display = 'none';
}

async function ajouterLocataire() {
  const nom = document.getElementById('nom').value.trim();
  const telephone = document.getElementById('tel').value.trim();
  const email = document.getElementById('email').value.trim();
  const montant_loyer = parseInt(document.getElementById('montant').value, 10);
  if (!nom || !telephone || !montant_loyer) return alert('Champs incomplets.');

  const url = LOCATAIRE_EN_EDITION ? `${API_URL}/api/locataires/${LOCATAIRE_EN_EDITION}` : `${API_URL}/api/locataires`;
  const methode = LOCATAIRE_EN_EDITION ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method: methode, headers: apiHeaders(),
    body: JSON.stringify({ nom, telephone, email, montant_loyer })
  });
  if (!res.ok) {
    const err = await res.json();
    return alert('Erreur : ' + (err.error || 'inconnue'));
  }
  annulerEditionLocataire();
  chargerLocataires();
}

function formaterNumeroWhatsApp(telephone) {
  let n = telephone.replace(/[^\d]/g, '');
  if (n.startsWith('00228')) n = n.slice(2);
  else if (n.length === 8) n = '228' + n;
  return n;
}

async function demanderPaiement(locataireId, telephone, nom) {
  const mois = new Date().toISOString().slice(0, 7);
  try {
    const res = await fetch(`${API_URL}/api/paiements/demander`, {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ locataire_id: locataireId, mois_concerne: mois })
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      return alert('Le serveur a renvoyé une réponse invalide (probablement en cours de réveil). Réessayez dans 30 secondes.');
    }

    if (!res.ok) return alert('Erreur : ' + (data.error || 'inconnue'));
    if (!data.paymentUrl) return alert('Réponse inattendue du serveur : ' + JSON.stringify(data));

    const message = `Bonjour ${nom}, voici votre lien pour payer le loyer (${mois}) :\n${data.paymentUrl}`;
    const numero = formaterNumeroWhatsApp(telephone);
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
    window.loyerpay.openExternal(url);

    chargerHistoriqueSiVisible();
  } catch (networkErr) {
    alert('Erreur réseau : ' + networkErr.message + '\n\nVérifiez votre connexion ou l\'URL du backend dans Configuration.');
  }
}

function chargerHistoriqueSiVisible() {
  if (document.getElementById('view-historique').style.display !== 'none') chargerHistorique();
}

let LOCATAIRES_CACHE = [];

async function remplirSelectLocataires() {
  const res = await fetch(`${API_URL}/api/locataires`, { headers: apiHeaders() });
  LOCATAIRES_CACHE = await res.json();
  const select = document.getElementById('select-locataire');
  select.innerHTML = LOCATAIRES_CACHE.map(l => `<option value="${l.id}">${l.nom}</option>`).join('');
  if (LOCATAIRES_CACHE.length) chargerHistorique();
}

async function chargerHistorique() {
  const locataireId = document.getElementById('select-locataire').value;
  if (!locataireId) return;
  const locataire = LOCATAIRES_CACHE.find(l => l.id === locataireId);
  const res = await fetch(`${API_URL}/api/locataires/${locataireId}/historique`, { headers: apiHeaders() });
  const paiements = await res.json();
  const tbody = document.querySelector('#table-historique tbody');
  tbody.innerHTML = '';
  paiements.forEach(p => {
    const tr = document.createElement('tr');
    let actionCell = '—';
    if (p.statut === 'confirme') {
      actionCell = `<button class="action" onclick="telechargerRecu('${p.id}')">Télécharger</button>`;
      if (locataire && locataire.telephone) {
        actionCell += ` <button onclick="envoyerRecuWhatsapp('${p.id}', '${locataire.telephone}', '${locataire.nom.replace(/'/g, "\\'")}', '${p.mois_concerne}', ${p.montant})" title="Envoyer par WhatsApp" style="background:#25D366;border:none;border-radius:50%;width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:4px;cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.15L2 22l4.97-1.31C8.5 21.5 10.2 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.2 14.1c-.22.62-1.28 1.2-1.77 1.24-.45.05-1 .07-1.63-.1-.37-.1-.85-.27-1.46-.53-2.57-1.1-4.24-3.7-4.37-3.87-.13-.17-1.04-1.38-1.04-2.64 0-1.25.66-1.87.9-2.12.23-.25.5-.32.67-.32h.48c.15 0 .36-.06.56.43.22.53.75 1.83.82 1.96.07.13.11.28.02.45-.09.17-.14.28-.27.43-.13.15-.28.34-.4.46-.13.13-.27.27-.12.53.15.26.67 1.11 1.44 1.8 1 .89 1.83 1.17 2.09 1.3.26.13.41.11.56-.07.15-.18.65-.76.82-1.02.17-.26.35-.22.58-.13.24.09 1.5.71 1.76.84.26.13.43.2.5.31.07.11.07.62-.15 1.24z"/></svg></button>`;
      }
      if (locataire && locataire.email) {
        actionCell += ` <button onclick="envoyerRecuEmail('${p.id}', '${locataire.email}', '${locataire.nom.replace(/'/g, "\\'")}', '${p.mois_concerne}', ${p.montant})" title="Envoyer par email" style="background:#4285F4;border:none;border-radius:50%;width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:4px;cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg></button>`;
      }
    }
    tr.innerHTML = `
      <td>${p.mois_concerne}</td>
      <td>${p.montant.toLocaleString('fr-FR')} FCFA</td>
      <td><span class="badge ${p.statut}">${p.statut}</span></td>
      <td>${actionCell}</td>`;
    tbody.appendChild(tr);
  });
}

function telechargerRecu(paiementId) {
  window.open(`${API_URL}/api/paiements/${paiementId}/recu?gestionnaireId=${GESTIONNAIRE_ID}`);
}

// Envoi semi-automatique : ouvre WhatsApp avec un message pre-rempli
// contenant le lien de telechargement du recu - le gestionnaire n'a plus
// qu'a appuyer sur Envoyer. Un lien WhatsApp ne peut pas joindre un fichier
// directement, seulement du texte (dont un lien cliquable).
function envoyerRecuWhatsapp(paiementId, telephone, nom, mois, montant) {
  const lienPdf = `${API_URL}/api/paiements/${paiementId}/recu?gestionnaireId=${GESTIONNAIRE_ID}`;
  const message = `Bonjour ${nom}, voici votre reçu pour le loyer de ${mois} (${montant.toLocaleString('fr-FR')} FCFA) :\n${lienPdf}`;
  const numero = formaterNumeroWhatsApp(telephone);
  window.loyerpay.openExternal(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`);
}

// Meme principe via l'application email par defaut de l'ordinateur - ouvre
// un brouillon pre-rempli, le gestionnaire n'a plus qu'a l'envoyer.
function envoyerRecuEmail(paiementId, email, nom, mois, montant) {
  const lienPdf = `${API_URL}/api/paiements/${paiementId}/recu?gestionnaireId=${GESTIONNAIRE_ID}`;
  const sujet = `Reçu de loyer - ${mois}`;
  const corps = `Bonjour ${nom},\n\nVoici votre reçu pour le loyer de ${mois} (${montant.toLocaleString('fr-FR')} FCFA) :\n${lienPdf}\n\nMerci.`;
  window.loyerpay.openExternal(`mailto:${email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`);
}

// ---------- SOLDE & RETRAIT ----------
async function chargerSolde() {
  if (!API_URL || !GESTIONNAIRE_ID) return;
  const res = await fetch(`${API_URL}/api/gestionnaires/solde`, { headers: apiHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById('solde-montant').textContent = data.solde.toLocaleString('fr-FR') + ' FCFA';
}

async function chargerHistoriqueRetraits() {
  if (!API_URL || !GESTIONNAIRE_ID) return;
  const res = await fetch(`${API_URL}/api/gestionnaires/retraits`, { headers: apiHeaders() });
  if (!res.ok) return;
  const retraits = await res.json();
  const tbody = document.querySelector('#table-retraits tbody');
  tbody.innerHTML = '';
  retraits.forEach(r => {
    const tr = document.createElement('tr');
    const date = new Date(r.created_at).toLocaleDateString('fr-FR');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${r.montant.toLocaleString('fr-FR')} FCFA</td>
      <td>${r.commission.toLocaleString('fr-FR')} FCFA</td>
      <td>${r.montant_net.toLocaleString('fr-FR')} FCFA</td>
      <td><span class="badge confirme">${r.statut}</span></td>`;
    tbody.appendChild(tr);
  });
}

async function demanderRetrait() {
  const montant = parseInt(document.getElementById('retrait-montant').value, 10);
  const telephone = document.getElementById('retrait-telephone').value.trim();
  if (!montant || !telephone) return alert('Renseignez le montant et le numéro de réception.');

  const res = await fetch(`${API_URL}/api/gestionnaires/retrait`, {
    method: 'POST', headers: apiHeaders(),
    body: JSON.stringify({ montant, telephone })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'solde_insuffisant') return alert(`Solde insuffisant. Disponible : ${data.solde_disponible.toLocaleString('fr-FR')} FCFA.`);
    return alert('Erreur : ' + (data.error || 'inconnue'));
  }
  alert(`Retrait envoyé ! Commission (6%) : ${data.commission.toLocaleString('fr-FR')} FCFA. Net reçu : ${data.montantNet.toLocaleString('fr-FR')} FCFA.`);
  document.getElementById('retrait-montant').value = '';
  document.getElementById('retrait-telephone').value = '';
  chargerSolde();
  chargerHistoriqueRetraits();
}

function lireFichierEnBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('signature-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await lireFichierEnBase64(file);
  document.getElementById('signature-preview').innerHTML =
    `<img src="${dataUrl}" style="max-width:200px;max-height:100px;border:1px solid #ddd;border-radius:4px">`;
  window._signatureDataUrl = dataUrl;
});

async function sauvegarderSignature() {
  if (!window._signatureDataUrl) return alert('Choisissez d\'abord une image.');
  const res = await fetch(`${API_URL}/api/gestionnaires/signature`, {
    method: 'PUT', headers: apiHeaders(),
    body: JSON.stringify({ signature_data: window._signatureDataUrl })
  });
  alert(res.ok ? 'Signature enregistrée. Elle apparaîtra sur vos prochains reçus.' : 'Erreur lors de l\'enregistrement.');
}

init();
