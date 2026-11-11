# Sport Tracker

Suivi d'un programme course + calisthénie, pensé pour le téléphone.

## Utilisation
1. Ouvre le site (GitHub Pages) et ajoute-le à l'écran d'accueil.
2. Réglages (⚙) : colle un **fine-grained personal access token** GitHub limité au dépôt `Sport-Tracker`, permission **Contents : Read and write**. Sans token, le site est en lecture seule.
3. Chaque séance validée crée un commit sur `data/log.json`. Hors ligne, les saisies sont mises en file et envoyées au retour du réseau.

Le programme est dans `data/program.json` et évolue par commits du coach. Détails techniques : `SPEC.md`.
