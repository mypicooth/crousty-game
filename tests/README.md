# Vérification du parcours Crousty

`browser.cjs` démarre un serveur local et utilise Chrome/Chromium avec Playwright.
Il teste les trois parties, les clics répétés, le meilleur score, les dix premiers
résultats, le classement vide et la reprise après une erreur de lecture ou
d’écriture. Les résolutions testées sont 390 × 844, 844 × 390 et 1280 × 800.

Les opérations Firebase sont simulées pour ces scénarios. Aucun participant
de test n’est ajouté à la base réelle. Les scores de partie sont contrôlés
pour vérifier la sauvegarde indépendamment de l’habileté du joueur.

Avec Playwright installé et son navigateur disponible :

```sh
node tests/browser.cjs
```

Variables d’environnement facultatives :

- `PLAYWRIGHT_MODULE` : chemin d’une installation existante de Playwright.
- `CHROME_PATH` : chemin du navigateur Chrome à utiliser.
- `SCREENSHOT_DIR` : dossier des captures du classement.
- `CHECK_FIREBASE=1` : vérifie aussi la lecture du classement réel depuis le
  navigateur local. Cette étape ne modifie aucune donnée Firebase.

Les scénarios ont été exécutés avec Playwright 1.63.0 et Chrome installé.
Ils ne remplacent pas un essai sur un téléphone physique ni une vérification
des écritures avec les règles Firebase de production.
