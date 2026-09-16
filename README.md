# Fantasy Nationale 2 — V2 Supabase

Cette version remplace les faux utilisateurs et le stockage local des pronostics par Supabase.

## Déploiement GitHub Pages

1. Remplacer les fichiers de l'ancien dépôt par le contenu de ce dossier.
2. Conserver `index.html` à la racine du dépôt.
3. Commit / Push sur `main`.
4. GitHub Pages redéploie automatiquement le site.
5. Sur iPhone, si une ancienne version apparaît encore, fermer le site, vider les données Safari du site ou attendre le rafraîchissement du service worker puis recharger.

## Supabase déjà requis

- Tables du fichier `supabase-schema.sql` de la V1.
- RLS installé.
- Trigger `private.handle_new_user()` installé.
- Authentication Email activée.
- Site URL / Redirect URL configurées vers l'URL GitHub Pages.

## Ce que fait cette V2

- Inscription email + mot de passe + pseudo.
- Confirmation email compatible avec l'URL GitHub Pages.
- Connexion persistante sur le navigateur.
- Profil et rôle admin lus depuis `profiles`.
- Équipes, joueurs, journées et matchs lus depuis Supabase.
- Pronostics enregistrés dans `match_predictions`.
- 3 marqueurs enregistrés dans `try_predictions`.
- Résultats et marqueurs réels saisis par l'admin.
- Calcul des scores dans `round_scores`.
- Classement général partagé entre tous les utilisateurs.

## Sécurité

`config.js` contient uniquement la Project URL et la Publishable Key. Elles sont faites pour être utilisées côté navigateur. Ne jamais ajouter une secret key ou une `service_role` key dans ce dépôt.
