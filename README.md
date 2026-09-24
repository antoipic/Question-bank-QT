# QCM B777

PWA hors ligne pour réviser les 349 QCM du livret B777 (`pdf/livret.pdf`).

- `app/` : l'application (seul dossier publié sur Netlify)
  - `app/questions.json` : `[{id, question, choix, reponse, page, image}]`
  - `app/images/` : schémas éventuels (aucun dans ce livret)
- `doutes.md` : questions dont la réponse entourée n'est pas claire
- `tools/extract.py` : extraction depuis le PDF (`python3 tools/extract.py 8 69`)
  - `tools/overrides.json` : corrections manuelles après relecture visuelle

## Tester en local

```
cd app && python3 -m http.server 8000
```
puis ouvrir http://localhost:8000

## Mettre à jour l'appli

Modifier les fichiers dans `app/`, puis commit et push sur `main` : Netlify redéploie.
La progression (localStorage) n'est jamais effacée par une mise à jour.

## Déploiement

Netlify (offre gratuite, repo privé) n'accepte que les commits signés par le propriétaire du repo :
les commits doivent avoir pour auteur `antoipic` (sans co-auteur).
