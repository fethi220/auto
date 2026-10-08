# 🎓 Classement PFE - Application Web

Application web moderne, rapide et sécurisée permettant aux étudiants d'une même promotion/groupe d'enregistrer leur moyenne et de visualiser leur classement pour le choix des sujets de PFE (Projet de Fin d'Études).

---

## ✨ Fonctionnalités Clés

1. **Confidentialité Totale des Notes :**
   - Les moyennes saisies sont utilisées **uniquement en interne** par le serveur pour calculer le rang.
   - L'API publique et le tableau public n'affichent **jamais** les moyennes des étudiants (seuls le rang et le nom/prénom apparaissent).

2. **Classement Automatique & Gestion des Ex æquo :**
   - Tri automatique décroissant (de la plus haute note à la plus basse).
   - Prise en charge des nombres décimaux (ex: `14.75`, `16.50`).
   - Règle standard de concours (*Standard Competition Ranking*) en cas d'égalité : les étudiants ex æquo partagent le même rang avec un badge distinctif.

3. **Base de Données Partagée en Temps Réel :**
   - Base de données SQLite persistante (`data/classement.db`).
   - Tous les étudiants partagent la même base (l'étudiant A voit l'étudiant B immédiatement).
   - Rafraîchissement automatique en arrière-plan toutes les 6 secondes sans recharger la page.

4. **Recherche Instantanée :**
   - Filtre rapide par nom ou prénom (ex: chercher "Fethi" affiche directement sa position).

5. **Panneau d'Administration Sécurisé :**
   - Protégé par mot de passe.
   - Affichage complet du classement **avec les moyennes**.
   - Modification des informations d'un étudiant.
   - Suppression d'un étudiant.
   - Bouton d'export officiel au format **CSV / Excel**.

6. **Design Moderne & Responsive :**
   - Interface épurée et soignée (palette Slate/Indigo, typographie Inter).
   - Mise en valeur des premières places (🥇 1er, 🥈 2e, 🥉 3e).
   - Parfaitement adapté aux smartphones, tablettes et ordinateurs.

---

## 🚀 Démarrage Rapide

### 1. Prérequis
- Node.js (version 22+ ou supérieure installée)

### 2. Lancement du serveur
```bash
# Se placer dans le dossier
cd "C:\Users\Utilisateur\.gemini\antigravity\scratch\classement-pfe"

# Démarrer le serveur
node server.js
```

Le serveur démarre sur : **`http://localhost:3000`**

---

## 🔐 Identifiants Administrateur

- **URL :** Cliquez sur le bouton **"🔐 Espace Admin"** en haut à droite.
- **Mot de passe par défaut :** `admin2025`
- *(Optionnel)* Vous pouvez changer le mot de passe via la variable d'environnement :
  ```bash
  $env:ADMIN_PASSWORD="votre_nouveau_mot_de_passe"
  node server.js
  ```

---

## 🧪 Tests du Système

Pour exécuter la suite de tests automatisés (vérifiant l'ajout, le tri, la confidentialité des moyennes, les ex æquo, la détection des doublons et la suppression) :
```bash
node test_system.js
```
