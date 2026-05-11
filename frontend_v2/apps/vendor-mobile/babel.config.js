module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            '@chatlogix/ui': '../../packages/ui/src',
            '@chatlogix/design-tokens': '../../packages/design-tokens/src',
            '@chatlogix/api-client': '../../packages/api-client/src',
            '@chatlogix/hooks': '../../packages/hooks/src',
            '@chatlogix/schemas': '../../packages/schemas/src',
            '@chatlogix/utils': '../../packages/utils/src',
            '@chatlogix/config': '../../packages/config/src',
            '@chatlogix/auth': '../../packages/auth/src',
          },
        },
      ],
    ],
  };
};

