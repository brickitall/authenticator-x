/**
 * Which services get a mark, and the details the icon sets do not carry.
 *
 * Adding a service is one word in the list below. `npm run icons:brands`
 * resolves its name, colour and website from Simple Icons and writes both the
 * matcher catalogue and the artwork; it fails loudly on a slug that does not
 * exist, so a typo cannot ship as a silently missing logo.
 */

/**
 * Simple Icons slugs (CC0). Grouped only for the benefit of whoever edits this.
 *
 * Notable absences are deliberate: OpenAI, Microsoft, Amazon, LinkedIn, Slack,
 * Adobe, Nintendo and others asked Simple Icons to remove their marks. A few
 * are picked up from Font Awesome below; the rest get a lettered tile, because
 * redrawing a mark whose owner objected works around the objection.
 */
export const SIMPLE_ICONS = `
# --- AI ---------------------------------------------------------------------
# Most of these come from LobeHub; the general brand sets carry almost none.
openai anthropic claude claudecode cursor deepseek elevenlabs
githubcopilot googlecolab googlegemini huggingface kaggle langchain mistralai
nvidia ollama perplexity qwen replicate weightsandbiases databricks snowflake
palantir grok xai midjourney stability cohere runway groq together fireworks
moonshot kimi doubao zhipu minimax baichuan yi hunyuan spark wenxin
openrouter poe v0 bolt lovable windsurf tabnine
comfyui civitai llamaindex langsmith dify n8n
suno udio luma pika hedra descript
notebooklm aistudio vertexai bedrock 

# --- Cloud and hosting ------------------------------------------------------
cloudflare digitalocean vercel netlify flydotio railway render vultr hetzner
ovh fastly akamai scaleway upcloud contabo cloudways heroku platformdotsh
netcup ionos hostinger bluehost siteground dreamhost kinsta wpengine
oracle ibmcloud alibabacloud tencentqq huaweicloud openstack proxmox
digitalocean firebase supabase planetscale neon turso upstash appwrite
nhost pocketbase convex

# --- Developer tooling ------------------------------------------------------
github gitlab bitbucket gitea codeberg sourceforge sourcehut gitee
circleci travisci jenkins buildkite teamcity codecov coveralls sonarqube snyk
npm docker pypi rubygems packagist nuget maven gradle homebrew
postman insomnia swagger jetbrains visualstudiocode neovim sublimetext zed
replit codesandbox stackblitz glitch codepen jsfiddle observable
deno bun nodedotjs python rust go kotlin swift flutter expo ionic
storybook chromatic nx turborepo vite webpack esbuild rollupdotjs
sentry datadog newrelic grafana prometheus elastic splunk sumologic
pagerduty opsgenie statuspage betterstack
terraform ansible puppet vagrant kubernetes helm argo rancher portainer
mongodb redis postgresql mysql mariadb sqlite clickhouse cockroachlabs
influxdb elasticsearch meilisearch algolia typesense
sourcegraph gitkraken sourcetree

# --- Identity and security --------------------------------------------------
auth0 okta clerk keycloak authelia authentik
1password bitwarden lastpass dashlane keeper keepassxc protonvpn
yubico tailscale wireguard openvpn nordvpn expressvpn surfshark mullvad
privateinternetaccess cloudflare hashicorpvault

# --- Work and productivity --------------------------------------------------
notion obsidian evernote joplin logseq anytype craft bear
todoist ticktick trello asana clickup basecamp linear height shortcut
airtable coda miro mural figma canva framer sketch invision abstract
loom calendly typeform surveymonkey docusign dropboxsign
atlassian jira confluence bitbucket statuspage opsgenie
zoom googlemeet webex gotomeeting whereby jitsi discord
intercom zendesk freshdesk helpscout crisp drift front
monday smartsheet wrike teamwork podio

# --- Storage and files ------------------------------------------------------
dropbox box mega pcloud sync icedrive backblaze filezilla rclone nextcloud
owncloud seafile syncthing resilio googledrive

# --- Communication and social ----------------------------------------------
telegram whatsapp signal threema wire session element matrix rocketdotchat
mattermost zulip
x facebook instagram threads bluesky mastodon reddit tumblr pinterest
snapchat tiktok youtube twitch kick rumble vimeo dailymotion
linktree medium substack ghost wordpress blogger hashnode devdotto
patreon kofi buymeacoffee gumroad
line kakao naver wechat weibo vk telegram viber

# --- Money and commerce -----------------------------------------------------
stripe paypal square cashapp venmo zelle adyen braintree plaid wise revolut
payoneer remitly westernunion skrill klarna afterpay affirm
mercury brex ramp monzo starlingbank nubank n26
robinhood interactivebrokers etrade charlesschwab fidelity vanguard webull
etoro plus500 metatrader tradingview
shopify woocommerce magento bigcommerce prestashop opencart etsy ebay
alibabadotcom aliexpress shopee mercadolibre rakuten walmart target
chase hsbc barclays santander revolut americanexpress visa mastercard

# --- Crypto -----------------------------------------------------------------
bitcoin ethereum solana cardano polkadot litecoin monero dogecoin
binance coinbase okx kucoin bybit gatedotio bitget htx cryptodotcom
bitstamp bitfinex deribit blockchaindotcom bitpay
uniswap trustwallet phantom exodus electrum blockstream trezor safe
etherscan chainlink polygon arbitrum optimism avalanche

# --- Gaming -----------------------------------------------------------------
steam epicgames gogdotcom itchdotio humblebundle battledotnet playstation
riotgames ubisoft ea rockstargames bethesda squareenix roblox minecraft
unity unrealengine godotengine itchdotio discord twitch

# --- Media and entertainment ------------------------------------------------
spotify netflix hbo primevideo disneyplus hulu crunchyroll plex jellyfin emby
soundcloud bandcamp tidal deezer lastdotfm audible goodreads letterboxd
imdb trakt

# --- Mail and domains -------------------------------------------------------
proton zoho fastmail tutanota mailfence posteo hey migadu
mailchimp sendgrid mailgun postmark resend brevo
namecheap godaddy porkbun gandi hover dynadot cloudflare
mailboxdotorg simplelogin

# --- Travel, food, transport ------------------------------------------------
airbnb bookingdotcom expedia tripadvisor skyscanner kayak agoda traveloka
uber lyft grab gojek bolt didi
doordash ubereats deliveroo justeat instacart
flixbus trainline

# --- Everything else --------------------------------------------------------
apple google cloudflare atlassian salesforce hubspot zapier ifttt make
wordpress squarespace wix webflow ghost
duolingo coursera udemy edx khanacademy skillshare pluralsight codecademy
freecodecamp leetcode hackerrank codeforces exercism
wikipedia archivedotorg
`;

/**
 * The website an icon set's "source" URL does not give correctly, usually
 * because it points at a press kit on a different host or at a GitHub repo.
 */
export const DOMAIN_OVERRIDES = {
  todoist: ['todoist.com'],
  mastodon: ['joinmastodon.org'],
  bluesky: ['bsky.app'],
  x: ['x.com', 'twitter.com'],
  google: ['google.com', 'accounts.google.com'],
  apple: ['apple.com', 'appleid.apple.com', 'icloud.com'],
  proton: ['proton.me', 'protonmail.com'],
  claude: ['claude.ai'],
  googlegemini: ['gemini.google.com'],
  googlecolab: ['colab.research.google.com'],
  googledrive: ['drive.google.com'],
  googlemeet: ['meet.google.com'],
  nodedotjs: ['nodejs.org'],
  flydotio: ['fly.io'],
  gatedotio: ['gate.io'],
  gogdotcom: ['gog.com'],
  itchdotio: ['itch.io'],
  rocketdotchat: ['rocket.chat'],
  cryptodotcom: ['crypto.com'],
  blockchaindotcom: ['blockchain.com'],
  bookingdotcom: ['booking.com'],
  alibabadotcom: ['alibaba.com'],
  platformdotsh: ['platform.sh'],
  lastdotfm: ['last.fm'],
  archivedotorg: ['archive.org'],
  mailboxdotorg: ['mailbox.org'],
  rollupdotjs: ['rollupjs.org'],
  tencentqq: ['qq.com'],
  battledotnet: ['battle.net'],
  starlingbank: ['starlingbank.com'],
  charlesschwab: ['schwab.com'],
  interactivebrokers: ['interactivebrokers.com'],
  hashicorpvault: ['hashicorp.com'],
  keepassxc: ['keepassxc.org'],
  privateinternetaccess: ['privateinternetaccess.com'],
  westernunion: ['westernunion.com'],
  mercadolibre: ['mercadolibre.com'],
  americanexpress: ['americanexpress.com'],
};

/**
 * Proper names for services whose logo set supplies none, where capitalising
 * the slug is not how the company writes it.
 */
export const NAMES = {
  ibmcloud: 'IBM Cloud',
  hashicorpvault: 'HashiCorp Vault',
  tencentqq: 'QQ',
  visualstudiocode: 'Visual Studio Code',
  sonarqube: 'SonarQube',
  opencart: 'OpenCart',
  sendgrid: 'SendGrid',
  codepen: 'CodePen',
  docusign: 'DocuSign',
  invision: 'InVision',
  dreamhost: 'DreamHost',
  disneyplus: 'Disney+',
  primevideo: 'Prime Video',
  charlesschwab: 'Charles Schwab',
  interactivebrokers: 'Interactive Brokers',
  westernunion: 'Western Union',
  mercadolibre: 'Mercado Libre',
  americanexpress: 'American Express',
  starlingbank: 'Starling Bank',
  privateinternetaccess: 'Private Internet Access',
  keepassxc: 'KeePassXC',
  trustwallet: 'Trust Wallet',
  cryptodotcom: 'Crypto.com',
  blockchaindotcom: 'Blockchain.com',
  bookingdotcom: 'Booking.com',
  gatedotio: 'Gate.io',
  archivedotorg: 'Internet Archive',
  mailboxdotorg: 'mailbox.org',
  platformdotsh: 'Platform.sh',
  lastdotfm: 'Last.fm',
  rocketdotchat: 'Rocket.Chat',
  nodedotjs: 'Node.js',
  rollupdotjs: 'Rollup',
  itchdotio: 'itch.io',
  gogdotcom: 'GOG',
  alibabadotcom: 'Alibaba',
  flydotio: 'Fly.io',
  battledotnet: 'Battle.net',
  githubcopilot: 'GitHub Copilot',
  googlegemini: 'Google Gemini',
  googlecolab: 'Google Colab',
  googledrive: 'Google Drive',
  googlemeet: 'Google Meet',
  claudecode: 'Claude Code',
  weightsandbiases: 'Weights & Biases',
  huggingface: 'Hugging Face',
  mistralai: 'Mistral AI',
  smartsheet: 'Smartsheet',
  teamwork: 'Teamwork',
  typesense: 'Typesense',
  bitstamp: 'Bitstamp',
  openai: 'OpenAI',
  xai: 'xAI',
  notebooklm: 'NotebookLM',
  aistudio: 'Google AI Studio',
  vertexai: 'Vertex AI',
  openrouter: 'OpenRouter',
  llamaindex: 'LlamaIndex',
  langsmith: 'LangSmith',
  comfyui: 'ComfyUI',
  civitai: 'Civitai',
  n8n: 'n8n',
  v0: 'v0',
  etrade: 'E*Trade',
  etoro: 'eToro',
  bitpay: 'BitPay',
  pcloud: 'pCloud',
  icedrive: 'Icedrive',
  flixbus: 'FlixBus',
  didi: 'DiDi',
  plus500: 'Plus500',
  trustwallet: 'Trust Wallet',
  mercadolibre: 'Mercado Libre',
  whereby: 'Whereby',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
  comfyui: 'ComfyUI',
  notebooklm: 'NotebookLM',
  aistudio: 'Google AI Studio',
  vertexai: 'Vertex AI',
  qwen: 'Qwen',
  xai: 'xAI',
  metatrader: 'MetaTrader',
  interactivebrokers: 'Interactive Brokers',
};

/** Other names a service is issued under, beyond its own. */
export const ALIASES = {
  google: 'gmail google account',
  x: 'twitter',
  apple: 'icloud apple id',
  proton: 'protonmail proton mail protonvpn',
  battledotnet: 'blizzard battlenet',
  playstation: 'sony psn',
  ea: 'electronic arts origin',
  steam: 'valve',
  npm: 'npmjs',
  docker: 'dockerhub',
  mongodb: 'atlas',
  wise: 'transferwise',
  epicgames: 'epic',
  riotgames: 'riot',
  flydotio: 'fly',
  alibabadotcom: 'alibaba',
  '1password': 'onepassword',
  anthropic: 'claude',
  openai: 'chatgpt chat gpt open ai gpt',
  googlegemini: 'gemini bard',
  grok: 'xai grok ai',
  githubcopilot: 'copilot',
  huggingface: 'hf',
  visualstudiocode: 'vscode',
  nodedotjs: 'node nodejs',
  postgresql: 'postgres',
  elasticsearch: 'elastic',
  kubernetes: 'k8s',
  hashicorpvault: 'vault hashicorp',
  tencentqq: 'qq tencent',
  ubereats: 'uber eats',
  primevideo: 'amazon prime video',
  americanexpress: 'amex',
  charlesschwab: 'schwab',
  interactivebrokers: 'ibkr',
  lastdotfm: 'lastfm',
  itchdotio: 'itch',
  gogdotcom: 'gog',
  rocketdotchat: 'rocketchat',
  cryptodotcom: 'crypto com',
  blockchaindotcom: 'blockchain',
  bookingdotcom: 'booking',
  platformdotsh: 'platformsh',
  rollupdotjs: 'rollup',
  archivedotorg: 'internet archive',
  mailboxdotorg: 'mailbox',
  gatedotio: 'gate',
};

/**
 * Marks that spell the name out instead of drawing a symbol. Nothing makes a
 * word legible inside 32 pixels, but filling the tile keeps shape and colour
 * distinct, and the row's own text carries the name anyway.
 */
export const WORDMARKS = new Set([
  'aliexpress', 'coinbase', 'grab', 'kakao', 'line', 'okx', 'salesforce',
  'venmo', 'zoho', 'zoom', 'lastpass', 'hsbc', 'visa', 'mastercard',
  'americanexpress', 'ebay', 'etsy', 'walmart', 'target', 'rakuten',
  'westernunion', 'skrill', 'klarna', 'afterpay', 'deezer', 'audible',
  'imdb', 'coursera', 'udemy', 'edx', 'freecodecamp', 'wikipedia',
  // Full-colour marks that spell the name out, seen on the contact sheet.
  'opencart', 'sonarqube', 'sendgrid', 'typesense', 'teamwork', 'sync',
  'docusign', 'invision', 'ibmcloud', 'heroku', 'oracle', 'maven', 'craft',
  'drift', 'hashicorpvault', 'bybit', 'canva', 'monday', 'front', 'podio',
  'dreamhost', 'magento', 'ramp',
]);

/**
 * Brands Simple Icons dropped at their owners' request, taken from Font Awesome
 * Free (icons CC BY 4.0). Font Awesome ships shapes without colours, so the
 * service's own colour is listed here — a colour is a fact, not artwork.
 */
export const FONT_AWESOME = [
  ['microsoft', 'Microsoft', 'microsoft.com live.com outlook.com office.com', 'outlook office live msa azure', '00A4EF'],
  ['amazon', 'Amazon', 'amazon.com', '', 'FF9900'],
  ['aws', 'AWS', 'aws.amazon.com signin.aws.amazon.com', 'amazonwebservices amazon web services', '232F3E'],
  ['linkedin', 'LinkedIn', 'linkedin.com', '', '0A66C2'],
  ['slack', 'Slack', 'slack.com', '', '4A154B'],
  ['xbox', 'Xbox', 'xbox.com', '', '107C10'],
  ['yandex', 'Yandex', 'yandex.com yandex.ru', '', 'FC3F1D'],
  ['linode', 'Linode', 'linode.com', 'akamai connected cloud', '00A95C'],
  ['alipay', 'Alipay', 'alipay.com', 'ant group', '1677FF'],
  ['paypal', 'PayPal', 'paypal.com', '', '003087'],
];

/**
 * Tile colours for flat marks supplied as markup rather than a single path.
 * The set draws them in `currentColor`; the brand's own colour is a fact about
 * the service, not artwork.
 */
export const FLAT_COLOURS = {
  openai: '000000',
  grok: '000000',
  xai: '000000',
  moonshot: '000000',
  poe: '000000',
  v0: '000000',
  windsurf: '09B6A2',
  openrouter: '6467F2',
  llamaindex: '000000',
  notebooklm: '4285F4',
};

/**
 * The services most people actually hold an account with.
 *
 * Suggestions rank these above anything that merely shares a prefix: typing
 * "git" should offer GitHub before Gitea, and "not" Notion before nothing.
 */
export const POPULAR = new Set(`
github google apple microsoft amazon aws facebook instagram x linkedin reddit
discord slack telegram whatsapp signal snapchat tiktok youtube twitch spotify
netflix dropbox box notion figma cloudflare digitalocean vercel netlify
gitlab bitbucket atlassian jira trello asana linear airtable zoom
stripe paypal wise revolut coinbase binance okx kraken robinhood
shopify etsy ebay aliexpress shopee grab
steam epicgames playstation xbox roblox
proton zoho mailchimp namecheap godaddy wordpress
1password bitwarden lastpass okta auth0 tailscale nordvpn
anthropic claude googlegemini perplexity huggingface cursor githubcopilot
openai grok midjourney
npm docker mongodb redis supabase firebase sentry datadog
line kakao naver yandex vk alipay
`.trim().split(/\s+/));

/**
 * Services whose logo lives under a name none of the sets spell the way we do.
 * `collection:icon-name`, where collection is logos, cib, token or crypto.
 */
export const EXPLICIT_ICONS = {
  hashicorpvault: 'logos:vault',
  front: 'logos:frontapp',
  heroku: 'logos:heroku',
  oracle: 'logos:oracle',
  salesforce: 'logos:salesforce',
  ibmcloud: 'logos:ibm',
  sonarqube: 'logos:sonarqube',
  maven: 'logos:maven',
  visualstudiocode: 'logos:visual-studio-code',
  codepen: 'logos:codepen-icon',
  sourcegraph: 'logos:sourcegraph',
  canva: 'logos:canva-icon',
  monday: 'logos:monday-icon',
  plaid: 'logos:plaid',
  uniswap: 'token:uniswap',
  // The plain mark is drawn in white and vanishes on a white tile.
  bybit: 'token:bybit-background',
  bitget: 'token:bitget',
  bitstamp: 'token:bitstamp',
  phantom: 'token:phantom',
  exodus: 'token:exodus',
  safe: 'token:safe',
  avalanche: 'token:avalanche',
  arbitrum: 'crypto:arb',
  htx: 'token:htx',
  disneyplus: 'logos:disney-plus',
  magento: 'logos:magento',
  bethesda: 'cib:bethesda',
};

/** Hosts a "source" URL points at that are never the service's own website. */
export const NOT_A_HOMEPAGE = new Set([
  'github.com', 'raw.githubusercontent.com', 'gist.github.com',
  'commons.wikimedia.org', 'wikimedia.org', 'en.wikipedia.org',
  'upload.wikimedia.org', 'seeklogo.com', 'worldvectorlogo.com',
  'brandfolder.com', 'gitlab.com', 'sourceforge.net', 'x.com', 'twitter.com',
  'facebook.com', 'instagram.com', 'youtube.com', 'medium.com',
]);
