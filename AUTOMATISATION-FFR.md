# Automatisation FFR — chaque dimanche à 20h

Cette version ajoute un workflow GitHub Actions qui synchronise automatiquement le championnat Nationale 2 depuis Mon Club House FFR.

## Ce qui est mis à jour
- score domicile / extérieur ;
- résultat réel (domicile / nul / extérieur) ;
- bonus défensif : défaite de 7 points ou moins ;
- bonus offensif : au moins 3 essais de plus que l'adversaire, calculé à partir des essais affichés sur la fiche FFR ;
- statut de la journée terminée (`scored`) quand tous les matchs ont un score ;
- ouverture de la prochaine journée (`open`).

Le workflow ne modifie que les matchs que la FFR affiche comme **Terminé**.

## Secret Supabase à créer dans GitHub

Ne jamais mettre la clé secrète Supabase dans `config.js`, `app.js` ou un fichier public.

1. Supabase > Project Settings / API Keys (ou Connect).
2. Créer/copier une **Secret key** commençant par `sb_secret_`.
3. GitHub > dépôt `fantasy-nationale2` > Settings > Secrets and variables > Actions.
4. `New repository secret`.
5. Nom exact : `SUPABASE_SECRET_KEY`.
6. Valeur : la clé `sb_secret_...`.

## Planification

`.github/workflows/ffr-sync.yml` :
- dimanche à 20:00 ;
- fuseau `Europe/Paris` ;
- passage automatique heure d'été / heure d'hiver ;
- lancement manuel possible depuis GitHub > Actions > Synchronisation résultats FFR > Run workflow.

## Sécurité

La publishable key reste côté navigateur. La Secret key n'est stockée que dans GitHub Actions Secrets et n'est jamais livrée aux utilisateurs du site.

## Tolérance aux données FFR incomplètes

Le score, le résultat et le bonus défensif sont mis à jour dès que le match est marqué `Terminé` par la FFR.

Pour le bonus offensif, le script lit les événements `Essai` de la fiche du match et identifie le club du marqueur via sa fiche FFR. Si un essai ne peut pas être attribué avec certitude, le script laisse le bonus offensif existant inchangé au lieu de risquer d'enregistrer une valeur fausse. Le détail apparaît dans les logs GitHub Actions.
