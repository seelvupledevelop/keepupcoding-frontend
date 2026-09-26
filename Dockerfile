# KeepUpCoding frontend — static assets behind Caddy.
# nginx serves the Soft UI build; no build step required (vanilla HTML/JS/CSS).
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx-frontend.conf /etc/nginx/conf.d/app.conf
COPY index.html /usr/share/nginx/html/index.html
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY locales /usr/share/nginx/html/locales
# Optional asset dirs if present
COPY img* /usr/share/nginx/html/img/

EXPOSE 8088
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8088/index.html >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
