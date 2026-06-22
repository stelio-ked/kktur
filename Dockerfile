# Estágio de Compilação (Builder)
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências completas
RUN npm ci

# Copiar código fonte
COPY . .

# Compilar o aplicativo (isso executa 'node build.js' de forma cross-platform)
RUN npm run build

# Estágio de Execução (Runner)
FROM node:20-alpine AS runner

WORKDIR /app

# Variável de ambiente de produção
ENV NODE_ENV=production

# Copiar dependências
COPY package*.json ./

# Instalar apenas dependências de produção para otimização de espaço
RUN npm ci --only=production

# Copiar a pasta compilada gerada no primeiro estágio
COPY --from=builder /usr/src/app/dist ./dist

# Expõe a porta padrão do Easypanel / AI Studio
EXPOSE 3000

# Comando de inicialização do servidor compilado
CMD ["node", "dist/server.js"]
