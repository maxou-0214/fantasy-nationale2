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

## V3 — bonus défensif automatique

Avant de publier cette version, exécuter `upgrade-defensive-bonus.sql` dans Supabase > SQL Editor.

L'administrateur saisit ensuite uniquement les deux scores. La base calcule automatiquement :
- le résultat réel (domicile / nul / extérieur) ;
- le bonus défensif de l'équipe perdante si l'écart est <= 7 points ;
- aucun bonus défensif en cas de nul ou de défaite de plus de 7 points.

Les bonus offensifs restent saisis manuellement.

## Synchronisation automatique FFR (V4)

La V4 ajoute `.github/workflows/ffr-sync.yml` et `scripts/sync-ffr.mjs`.
Le workflow s'exécute chaque dimanche à 20h (Europe/Paris) et met à jour les résultats depuis Mon Club House FFR.

Avant le premier lancement, crée dans GitHub Actions le secret `SUPABASE_SECRET_KEY` avec une clé Supabase `sb_secret_...`.
Voir `AUTOMATISATION-FFR.md` pour les étapes détaillées.
