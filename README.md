# Fantasy Nationale 2 Rugby — V1

Prototype web/PWA fonctionnel, sans dépendances ni compilation.

## Lancer localement
Ouvre un terminal dans ce dossier puis :

```bash
python -m http.server 8080
```

Puis ouvre `http://localhost:8080` dans ton navigateur.

> Évite d'ouvrir directement `index.html` en `file://` car le service worker PWA nécessite HTTP/HTTPS.

## Déployer sur GitHub Pages
1. Crée un dépôt GitHub.
2. Mets tous les fichiers de ce dossier à la racine du dépôt.
3. Dans **Settings > Pages**, choisis **Deploy from a branch**.
4. Sélectionne la branche `main` et le dossier `/ (root)`.
5. GitHub affichera ensuite l'URL publique.

## Tester la V1
- Le profil `Max` a les droits admin.
- Utilise le sélecteur utilisateur en haut à droite pour simuler plusieurs joueurs.
- Fais les pronostics dans `Pronostics`.
- Dans `Admin`, renseigne les résultats, bonus réels et marqueurs.
- Va dans `Classement` : les points sont recalculés automatiquement.

## Important
Les données sont actuellement enregistrées dans le `localStorage` du navigateur. Cela permet de tester toute la logique sans backend, mais **les données ne sont pas partagées entre plusieurs téléphones/ordinateurs**.

Pour la vraie fantasy multijoueur, utilise `supabase-schema.sql`, Supabase Auth et des politiques RLS. Voir `ARCHITECTURE.md`.
