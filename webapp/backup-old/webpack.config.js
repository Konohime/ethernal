/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');
const { ProvidePlugin, DefinePlugin } = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const sveltePreprocess = require('svelte-preprocess');

const outputPath = path.resolve(__dirname, process.env.BUILD_OUTPUT || 'dist');
const buildDate = Math.floor(Date.now() / 1000);

const env = process.env.ENV || 'dev';
console.log(`Using ${env} environment`);

const environments = {
  prod: {
    assetEnv: 'alpha',
    contracts: './contracts/production.json',
    serverList: 'https://ethernal-list.prod.tmcloud.io',
    cache: 'https://ethernal.prod.tmcloud.io',
    ethUrl: 'https://mainnet.base.org',
    blockExplorerUrl: 'https://basescan.org',
  },
  staging: {
    assetEnv: 'dev',
    contracts: './contracts/staging.json',
    serverList: 'https://181boa3ktb.execute-api.us-east-1.amazonaws.com/default/serverList-dev',
    cache: 'https://ethernal-be-alpha.herokuapp.com',
    ethUrl: 'https://sepolia.base.org',
    blockExplorerUrl: 'https://sepolia.basescan.org',
  },
  dev: {
    assetEnv: 'dev',
    contracts: './contracts/development.json',
    ethUrl: '',
    blockExplorerUrl: 'https://sepolia.basescan.org',
  },
};

const contractsPath = process.env.CONTRACTS_PATH || environments[env].contracts;
const contractsInfo = path.resolve(__dirname, contractsPath);
if (!fs.existsSync(contractsInfo)) {
  console.error(`${env} contracts info file doesn't exist: ${contractsInfo}`);
  process.exit(1);
}
console.log(`Using ${contractsInfo} contracts`);

const serverList = process.env.SERVER_LIST || environments[env].serverList || '';
console.log(`Using ${serverList || 'fallback'} server list`);

const cacheApi = process.env.CACHE_API || environments[env].cache || '';
console.log(`Using ${cacheApi || 'fallback'} cache api`);

const ethUrl = process.env.ETH_URL || environments[env].ethUrl || '';
console.log(`Using ${ethUrl || 'fallback'} eth node`);

const assetEnv = process.env.ASSET_ENV || environments[env].assetEnv || 'alpha';
const blockExplorerUrl = process.env.BLOCK_EXPLORER_URL || environments[env].blockExplorerUrl || 'https://sepolia.basescan.org';

const commit = process.env.COMMIT || '';
if (commit) {
  console.log(`Tagging build with commit ${commit}`);
}

const sentryDsn = process.env.SENTRY_DSN || '';

module.exports = (webpackEnv, argv) => {
  const mode = argv.mode || 'development';
  const isDev = mode === 'development';
  
  console.log(`Using mode ${mode}`);

  return {
    entry: {
      bundle: './src/main.js',
    },
    resolve: {
      modules: ['src', 'node_modules'],
      extensions: ['.mjs', '.js', '.svelte', '.json'],
      alias: {
        contractsInfo,
        svelte: path.resolve('node_modules', 'svelte/src/runtime'),
      },
      mainFields: ['svelte', 'browser', 'module', 'main'],
      conditionNames: ['svelte', 'browser', 'import'],
    },
    output: {
      path: outputPath,
      publicPath: '/',
      filename: isDev ? '[name].js' : '[name].[contenthash].js',
      chunkFilename: isDev ? '[name].js' : '[name].[contenthash].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.svelte$/,
          use: {
            loader: 'svelte-loader',
            options: {
              compilerOptions: {
                dev: isDev,
              },
              emitCss: !isDev,
              hotReload: isDev,
              preprocess: sveltePreprocess({
                scss: true,
                sourceMap: isDev,
              }),
            },
          },
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
            'css-loader',
          ],
        },
        {
          test: /\.scss$/,
          use: [
            isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
            'css-loader',
            'sass-loader',
          ],
        },
        {
          test: /\.svg$/,
          type: 'asset/source',
        },
        {
          test: /\.(png|jpg|gif|webp)$/,
          type: 'asset/resource',
        },
        {
          test: /node_modules\/svelte\/.*\.mjs$/,
          resolve: {
            fullySpecified: false,
          },
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: isDev ? '[name].css' : '[name].[contenthash].css',
      }),
      new Dotenv({
        systemvars: true,
      }),
      new DefinePlugin({
        ASSET_ENV: JSON.stringify(assetEnv),
        BLOCK_EXPLORER_URL: JSON.stringify(blockExplorerUrl),
        ENV: JSON.stringify(env),
        MODE: JSON.stringify(mode),
        BUILD_TIMESTAMP: buildDate,
        COMMIT: JSON.stringify(commit),
        CACHE_API: JSON.stringify(cacheApi),
        ETH_URL: JSON.stringify(ethUrl),
        SENTRY_DSN: JSON.stringify(sentryDsn),
        SERVER_LIST: JSON.stringify(serverList),
      }),
      new HtmlWebpackPlugin({
        template: 'src/index.ejs',
        templateParameters: {
          timestamp: buildDate,
          commit,
        },
      }),
      new CopyPlugin({
        patterns: [{ from: 'static', to: './' }],
      }),
    ],
    devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
    devServer: {
      static: {
        directory: path.join(__dirname, 'static'),
      },
      host: 'localhost',
      port: 8080,
      hot: true,
      historyApiFallback: true,
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          pixi: {
            test: /[\\/]node_modules[\\/](@pixi|pixi)/,
            name: 'pixi',
            chunks: 'all',
          },
          vendor: {
            test: /[\\/]node_modules[\\/](?!(@pixi|pixi))/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    },
    stats: {
      colors: true,
      modules: false,
      children: false,
    },
  };
};
