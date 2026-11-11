# Sport Tracker — notes pour le coach

- Le site est décrit dans `SPEC.md` (vanilla JS, sans build, GitHub Pages).
- `data/log.json` : séances réalisées, écrit par l'app (commits `log: …`). Ne jamais le réécrire à la main sauf demande explicite.
- `data/program.json` : programme, modifié par le coach. Commits `program: …`, mettre à jour `updatedAt`, `coachNote`, et ajouter des semaines dans `weeks` (l'app répète la dernière semaine sinon).
- Pour faire évoluer le programme : lire le log (statuts, reps réelles vs cibles, ressenti, tests de la semaine 4), puis ajuster cibles et volume progressivement.
- Contraintes : volume de poussée limité (pompes/dips légers et facultatifs). Dépôt public : aucune info personnelle ou médicale dans le dépôt.
