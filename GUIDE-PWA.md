# 📱 Nûr — Application mobile (PWA) — Guide

Cette **PWA** (Progressive Web App) s'installe sur **iPhone et Android** comme une vraie app,
**sans passer par les stores, sans compte développeur, sans Mac**. Elle fonctionne **hors ligne**.

Fonctions :
- 🕌 Adhan / horaires des 5 prières (localisation GPS ou ville)
- 📿 Adhkar matin/soir, Douaa, Roqya
- 📖 Coran : **chaque verset se télécharge au 1ᵉʳ clic** (bouton ⬇) pour l'écouter **hors ligne** ensuite, avec **sous-titre arabe** synchronisé ; + mode YouTube (Imam Al-Dakhin)
- 🍪 Écran de **consentement** (cookies + localisation) au 1ᵉʳ lancement
- ✉️ Formulaire de contact (votre e-mail reste caché)

---

## 🚀 Étape 1 — Mettre la PWA en ligne (gratuit, 2 min)

Une PWA doit être hébergée en **HTTPS**. Le plus simple : **Netlify Drop**.

1. Allez sur **https://app.netlify.com/drop**
2. Glissez-déposez le **dossier `NurPWA`** (ou décompressez `Nûr-PWA.zip` d'abord) dans la zone
3. Netlify génère une adresse du type `https://nur-xxxx.netlify.app` — **c'est le lien de votre app !**
4. (Optionnel) Renommez le site ou ajoutez votre propre nom de domaine dans les réglages Netlify.

> Alternatives gratuites équivalentes : **Cloudflare Pages**, **GitHub Pages**, **Vercel**.

---

## 📲 Étape 2 — Installer sur le téléphone

### iPhone / iPad (Safari)
1. Ouvrez le lien `https://…netlify.app` dans **Safari**
2. Bouton **Partager** (carré avec flèche ↑) → **« Sur l'écran d'accueil »**
3. L'icône mosquée 🕌 apparaît sur l'écran d'accueil — ouvrez-la : plein écran, comme une app.

### Android (Chrome)
1. Ouvrez le lien dans **Chrome**
2. Une bannière **« Installer l'application »** apparaît (ou menu ⋮ → **Installer l'application**)
3. L'icône mosquée 🕌 s'ajoute à l'écran d'accueil.

---

## 📥 Hors ligne (Coran)
- Au 1ᵉʳ lancement, acceptez le consentement et autorisez la localisation.
- Dans **Coran → Hors ligne**, appuyez sur **⬇** pour sauvegarder le verset affiché,
  ou **« Télécharger toute la sourate »** pour tout enregistrer d'un coup.
- Les versets sauvegardés se lisent ensuite **sans Internet**.

## 🔔 Limite à connaître
Un téléphone ne laisse pas une app web jouer l'Adhan automatiquement **quand elle est fermée**
(restriction des navigateurs). L'Adhan et les horaires s'affichent quand l'app est ouverte.
Pour un Adhan en arrière-plan garanti, il faudrait une app native (stores) — la version **PC**
le fait déjà.

---
Créé par **Messaoudi Oualid** · Application **gratuite à vie**.
