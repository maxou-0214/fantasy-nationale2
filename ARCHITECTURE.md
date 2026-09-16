# Architecture MVP — Fantasy Nationale 2 Rugby

## 1. Objectif fonctionnel
Pour chaque journée de championnat :
- pronostiquer `domicile / nul / extérieur` pour chaque match ;
- pronostiquer indépendamment les bonus offensifs et défensifs ;
- sélectionner exactement 3 joueurs marqueurs d'essai ;
- verrouiller les pronostics à la deadline ;
- saisir les résultats réels côté administrateur ;
- calculer automatiquement les scores et le classement.

## 2. Barème
- Résultat exact : **+2 pts**.
- Chaque bonus sélectionné et réellement obtenu : **+3 pts**, indépendamment du résultat du match.
- Chaque joueur sélectionné ayant marqué au moins un essai pendant la journée : **+5 pts**.
- Plusieurs essais du même joueur ne multiplient pas les 5 points dans cette V1.
- Ne pas sélectionner un bonus qui n'a finalement pas lieu ne donne pas de point : seuls les bonus effectivement pronostiqués puis obtenus rapportent.

## 3. Écrans MVP
1. Accueil : journée, deadline, avancement, score courant.
2. Pronostics : résultat + bonus de chaque match, puis 3 marqueurs.
3. Classement : résultat / bonus / marqueurs / total.
4. Historique : journées passées.
5. Admin : journée, deadline, équipes, joueurs, matchs, résultats, bonus réels, marqueurs réels.

## 4. Architecture cible production
- Frontend : SPA/PWA responsive.
- Authentification : Supabase Auth (email + mot de passe ou magic link).
- Base de données : Supabase PostgreSQL.
- Sécurité : Row Level Security (RLS).
- Hébergement : GitHub Pages pour le prototype statique ; Vercel/Netlify ou hébergement statique pour la version Supabase.
- PWA : manifest + service worker inclus.

## 5. Règles serveur importantes
Les règles suivantes doivent être contrôlées côté base/API, pas seulement dans le navigateur :
- aucun changement de pronostic après la deadline ;
- maximum 3 marqueurs par utilisateur et journée ;
- un même marqueur ne peut pas être sélectionné deux fois ;
- seuls les admins peuvent écrire les résultats réels ;
- idéalement, masquer les pronostics des concurrents jusqu'à la deadline ;
- recalcul du score déclenché après modification d'un résultat.

## 6. Algorithme de score
Pour un utilisateur et une journée :

```text
result_points = somme(2 si résultat pronostiqué == résultat réel)
bonus_points  = somme(3 pour chaque bonus pronostiqué présent dans les bonus réels)
scorer_points = somme(5 pour chaque joueur choisi présent parmi les marqueurs réels de la journée)
total         = result_points + bonus_points + scorer_points
```

## 7. Passage du prototype à la production
La V1 fournie ici utilise `localStorage` afin d'être testable immédiatement sans compte cloud. Le fichier `supabase-schema.sql` contient le modèle relationnel cible. La prochaine étape consiste à remplacer les fonctions `loadState/saveState` de `app.js` par des appels Supabase et à ajouter un écran d'authentification.
