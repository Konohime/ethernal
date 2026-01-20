module.exports = async ({deployments}) => {
  const {log} = deployments;
  log('');
  log('🎉 Contracts deployed successfully!');
  log('');
};

module.exports.tags = ['Done'];
module.exports.runAtTheEnd = true;
