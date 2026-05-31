# Build context = racine du repo (pour avoir accès à webapp/contracts/).
# Sur Railway : Root Directory = "." et Dockerfile Path = "backend/Dockerfile".
FROM node:20

WORKDIR /usr/src/app

ARG COMMIT

ENV COMMIT=$COMMIT
ENV HEROKU_SLUG_COMMIT=$COMMIT

# Dépendances
COPY backend/package*.json ./
RUN npm install

# Code backend
COPY backend/src src/

# Fichier de contrats déployés (équivalent du `cp` de deploy-heroku.sh).
# Pour passer en prod, remplacer staging.json par production.json.
COPY webapp/contracts/staging.json src/contractsInfo.json

EXPOSE 3399
CMD ["node","src/server.js"]
