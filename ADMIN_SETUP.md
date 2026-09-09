# myPicBooth Game Studio — activation

L’administration est disponible à `/admin/`. Le jeu historique reste à `/`.
Chaque nouveau jeu utilise `/?game=IDENTIFIANT` sur le domaine public du jeu.
Le sous-domaine confirmé pour l’administration est **admin.myicbooth.com**.
Le compte prévu est **contact@mypicbooth.com**.

## Ce qui est livré

- Connexion Firebase (email/mot de passe ou Google) et vérification serveur de
  l’adresse autorisée et de sa validation.
- Création et duplication de campagnes Flappy Bird : brouillon, publié, pause.
- Nom, société, dates, logo, personnage, fond, texture d’obstacles, couleur.
- Limite de 1 à 10 parties par adresse email, compte à rebours, difficulté.
- Import d’images et de PDF (3 Mo), règlement et politique de confidentialité.
- Consentements séparés avec horodatage et liens des documents acceptés.
- Récapitulatif de score personnalisé, via Resend, après la dernière partie.
- Participants par jeu, recherche, filtre marketing, export CSV et suppression.
- Consultation des participants du jeu Crousty historique.

## Raccorder Firebase à Vercel

1. Activer Firebase Authentication. Activer Email/Password et/ou Google.
   Ajouter `admin.myicbooth.com`, `crousty-game.vercel.app` et le domaine de
   prévisualisation utilisé aux domaines autorisés. En local, ajouter localhost.
2. Créer le compte `contact@mypicbooth.com` dans Authentication. L’email doit
   être vérifié : Google le fournit si c’est le compte correspondant ; pour un
   mot de passe, terminer la vérification email via Firebase.
3. Activer le bucket Cloud Storage. Utiliser le nom exact indiqué dans la console.
4. Dans les paramètres du projet Firebase, générer un compte de service Admin SDK
   dédié au serveur. Placer son JSON dans la variable **Vercel**
   `FIREBASE_SERVICE_ACCOUNT_JSON`. Ne pas le coller dans le code ni dans Git.
5. Renseigner les variables de `.env.example` dans le projet Vercel existant.
   `STUDIO_SESSION_SECRET` doit être aléatoire et contenir au moins 32 caractères.
   Ne pas le changer en cours de campagne : il détermine les identifiants de
   participation et signe les sessions. `PUBLIC_GAME_ORIGIN` désigne le domaine
   public, pas le domaine admin.
6. Appliquer les règles privées ci-dessous **avant** de passer `STUDIO_ENABLED`
   à `true`. Sans activation, les API refusent les opérations, y compris avec
   un compte connecté : aucune fausse administration de démonstration n’est ouverte.

### Règles Realtime Database : étape indispensable

Les API utilisent l’Admin SDK. Les navigateurs n’ont besoin d’aucun accès direct
au nœud `studio`. Interdire lecture et écriture client sur ce nœud.

Attention : les règles Realtime Database héritent des autorisations des parents.
Une règle `.read: true` ou `.write: true` à la racine rendrait le blocage de
`studio` inopérant. **Ne pas se contenter d’ajouter le fragment fourni** sous les
règles temporaires actuelles. Supprimer les autorisations globales et déplacer
les droits nécessaires aux anciennes campagnes sur leurs chemins spécifiques.

`firebase/studio-rules.fragment.json` est un fragment, pas un fichier à déployer
aveuglément. Vérifier les règles dans l’émulateur puis dans la console :

- aucune lecture/écriture directe sur `/studio`, connecté ou non ;
- seule l’API Admin SDK accède aux configurations privées et participants ;
- le jeu historique doit être traité séparément : son ancien navigateur écrit
  directement dans `/campaigns/crousty_2026`. Ses règles et son stockage ne sont
  pas migrés par cette livraison, pour éviter une coupure de la campagne.

Les uploads du studio passent par le serveur. `firebase/storage.rules` interdit
les accès SDK client directs ; les fichiers de marque et PDF disposent de liens
publics de téléchargement, car ils sont affichés aux participants. Ne jamais
y importer des exports de participants ou des documents confidentiels.

## Emails

Le module d’envoi utilise l’API Resend côté serveur et des clés d’idempotence.
Il ne fait aucun envoi tant que `emailsEnabled` n’est pas activé sur un jeu.

1. Vérifier un domaine d’envoi dans Resend et appliquer les entrées DNS indiquées.
2. Configurer `RESEND_API_KEY` et `RESEND_FROM` (ex. `myPicBooth <jeux@DOMAINE_VERIFIE>`).
3. Activer l’email dans l’éditeur, personnaliser l’objet et le corps du message.
   Les variables disponibles sont `{{prenom}}`, `{{score}}`, `{{jeu}}`.
4. Tester avec une adresse contrôlée avant une campagne réelle.

Les récapitulatifs concernent la participation ; le consentement marketing est
stocké séparément. Les erreurs d’envoi sont conservées dans `/studio/emails`.
Le navigateur réessaie la sauvegarde si elle échoue ; il n’y a pas encore de
service planifié de relance des emails en échec après fermeture de la page.

## Sous-domaine

Dans le projet Vercel existant, ajouter `admin.myicbooth.com` dans Settings →
Domains. Chez le gestionnaire DNS de `myicbooth.com`, créer **l’entrée exacte
indiquée par Vercel**, puis vérifier le certificat. Ne pas modifier le domaine
du jeu public. Le rewrite dans `vercel.json` dirige la racine du sous-domaine
admin vers `/admin/index.html`.

## Validation et limites

```sh
npm install
npm test
npm run build
npm run dev
```

Les tests navigateur utilisent des services simulés et ne créent pas de vraies
participations. Le mode local charge les variables définies dans l’environnement
(avec Node, `node --env-file=.env scripts/dev.cjs` peut charger un fichier local).

Avec Playwright disponible (`PLAYWRIGHT_MODULE` peut pointer sur une installation
existante et `CHROME_PATH` sur Chrome), exécuter aussi :

```sh
node tests/browser.cjs
node tests/studio-browser.cjs
```

Le second scénario teste l’administration avec les vrais handlers API et une
base en mémoire, puis crée un jeu à deux parties, le joue, recharge la page et
vérifie la limite, les participants et l’export CSV. L’upload et l’authentification
Firebase sont simulés. Aucun email réel n’est envoyé pendant ces tests.

La limite s’applique à l’email déclaré, sans preuve d’identité ni vérification de
la possession de l’email du participant. Les scores sont validés comme nombres
et associés à une partie autorisée, mais restent calculés par le navigateur :
ce n’est pas encore un dispositif anti-triche pour un concours à enjeu élevé.
Une suppression de participant efface sa limite, son score et les traces de son
email de récapitulatif. L’export CSV contient des données privées.

Sources techniques : [Admin SDK](https://firebase.google.com/docs/admin/setup),
[vérification des sessions](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[fonctions Vercel](https://vercel.com/docs/functions/runtimes/node-js),
[idempotence des emails](https://resend.com/docs/dashboard/emails/idempotency-keys).
