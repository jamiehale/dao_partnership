const Migrations = artifacts.require('./Migrations.sol'); // eslint-disable-line no-undef

module.exports = (deployer) => {
  deployer.deploy(Migrations);
};
