// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['./'],
        alias: {
          '@': './src',
          '@theme': './src/theme',
          '@store': './src/store',
          '@api': './src/api',
          '@hooks': './src/hooks',
          '@components': './src/components',
          '@gridtypes': './src/types',
          '@utils': './src/utils',
          '@websocket': './src/websocket',
          '@services': './src/services',
          '@i18n': './src/i18n',
          '@data': './src/data',
        },
      }],
      'react-native-reanimated/plugin',
    ],
  };
};
