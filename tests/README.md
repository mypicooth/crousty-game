# Vérification du parcours Crousty

`browser.cjs` démarre un serveur local et utilise Chrome/Chromium avec Playwright.
Il teste les trois parties, les clics répétés, le meilleur score, les dix premiers
résultats, le classement vide et la reprise après une erreur de lecture ou
d’écriture. Les résolutions testées sont 390 × 844, 844 × 390 et 1280 × 800.
Il vérifie aussi le compte à rebours 3–2–1 avant chaque partie, l’immobilité du
personnage et l’absence de lancement supplémentaire lors des appuis pendant l’attente.

Les tests de cadence ne nécessitent aucune dépendance :

```sh
node --test tests/game-loop.test.mjs
```

Ils comparent dix secondes de simulation à 30, 60, 90, 120 et 144 Hz,
la durée du compte à rebours, la pause en arrière-plan et l’arrêt des animations.

`node --test tests/flappy-config.test.mjs tests/engine.test.mjs tests/theme.test.mjs`
valide la configuration, le moteur et le thème sans navigateur.

Les opérations Firebase sont simulées pour ces scénarios. Aucun participant
de test n’est ajouté à la base réelle. Les scores de partie sont contrôlés
pour vérifier la sauvegarde indépendamment de l’habileté du joueur.

Avec Playwright installé et son navigateur disponible :

```sh
node tests/browser.cjs
```

`studio-browser.cjs` démarre le serveur avec les vrais handlers API et une base de
données en mémoire, simule l’authentification Firebase et l’upload, puis teste
l’administration : connexion, création d’une campagne Flappy Bird, personnalisation
du personnage et des écrans, publication et export CSV des participants d’une partie
jouée en deux manches ; il teste aussi l’aperçu en iframe, un champ personnalisé et
la validation des paliers.

```sh
node tests/studio-browser.cjs
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
