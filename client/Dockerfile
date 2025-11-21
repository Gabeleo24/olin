FROM node:20 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=https://localhost:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN VITE_API_BASE_URL=${VITE_API_BASE_URL} npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

