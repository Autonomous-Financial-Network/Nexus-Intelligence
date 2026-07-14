/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category', label: 'Getting Started',
      items: ['guides/quickstart', 'guides/langchain-quickstart'],
    },
    {
      type: 'category', label: 'Guides',
      items: ['guides/security', 'guides/crewai-integration'],
    },
    {
      type: 'category', label: 'API Reference',
      items: ['api/sdk-reference'],
    },
  ],
}
module.exports = sidebars
