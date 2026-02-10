import axios from 'axios';

const GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';

export interface UserTokenInfo {
    access_token: string;
    expires_in: number;
    token_type: string;
}

export interface PageInfo {
    id: string;
    name: string;
    access_token: string;
    category: string;
    fan_count?: number;
    followers_count?: number;
    created_time?: string;
    picture_url?: string;
}

export class FacebookClient {
    private appId: string;
    private appSecret: string;

    constructor(appId: string, appSecret: string) {
        this.appId = appId;
        this.appSecret = appSecret;
    }

    public async exchangeForLongLivedToken(shortToken: string): Promise<UserTokenInfo> {
        const url = `${GRAPH_API_BASE}/oauth/access_token`;
        const params = {
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: shortToken,
        };

        console.log(`[FB API] Request: GET ${url}`, { ...params, client_secret: '***' });
        const response = await axios.get(url, { params });
        console.log(`[FB API] Response Status: ${response.status}`);
        return response.data;
    }

    public async getUserId(accessToken: string): Promise<string> {
        const url = `${GRAPH_API_BASE}/me`;
        console.log(`[FB API] Request: GET ${url}`);
        const response = await axios.get(url, { params: { access_token: accessToken } });
        console.log(`[FB API] Response Status: ${response.status}`);
        return response.data.id;
    }

    public async getPages(userId: string, accessToken: string): Promise<PageInfo[]> {
        const url = `${GRAPH_API_BASE}/${userId}/accounts`;
        console.log(`[FB API] Request: GET ${url}`);
        const response = await axios.get(url, {
            params: {
                access_token: accessToken,
                limit: 100 // Implement pagination if needed
            }
        });

        console.log(`[FB API] Found ${response.data.data.length} pages`);
        return response.data.data.map((page: any) => ({
            id: page.id,
            name: page.name,
            access_token: page.access_token,
            category: page.category,
        }));
    }

    /**
     * Fetches fresh tokens for all pages managed by the user.
     * Useful for automatic recovery when a stored page token has expired.
     */
    public async syncPageTokens(userAccessToken: string): Promise<PageInfo[]> {
        console.log('[FB API] Syncing all page tokens for user...');
        const userId = await this.getUserId(userAccessToken);
        return this.getPages(userId, userAccessToken);
    }

    public async getPageDetails(pageId: string, pageToken: string) {
        // Try with all fields first
        const fields = 'id,name,fan_count,followers_count,created_time,verification_status,picture.type(large)';
        try {
            const url = `${GRAPH_API_BASE}/${pageId}`;
            const params = { fields, access_token: pageToken };
            console.log(`[FB API] Request: GET ${url} (Page ID: ${pageId})`);
            const response = await axios.get(url, { params });
            return response.data;
        } catch (e: any) {
            // Fallback: Remove followers_count if it's the cause of 400
            if (e.response?.data?.error?.message?.includes('followers_count')) {
                console.log(`[FB API] Fallback: Retrying without followers_count for ${pageId}`);
                const fallbackFields = 'id,name,fan_count,created_time,verification_status,picture.type(large)';
                const url = `${GRAPH_API_BASE}/${pageId}`;
                const response = await axios.get(url, {
                    params: { fields: fallbackFields, access_token: pageToken }
                });
                return response.data;
            }
            throw e;
        }
    }

    public async checkInsights(pageId: string, pageToken: string): Promise<boolean> {
        const url = `${GRAPH_API_BASE}/${pageId}/insights`;
        const params = {
            metric: 'page_impressions',
            period: 'day',
            access_token: pageToken,
        };
        try {
            console.log(`[FB API] Request: GET ${url} (Insights Check)`);
            const response = await axios.get(url, { params });
            // If data exists, it means insights are accessible (>= 100 likes/followers)
            return response.data.data && response.data.data.length > 0;
        } catch (e) {
            console.log(`[FB API] Insights check failed for ${pageId} (likely < 100 followers)`);
            return false;
        }
    }

    public async createLiveVideo(pageId: string, pageToken: string, options: { title: string; description: string }) {
        const url = `${GRAPH_API_BASE}/${pageId}/live_videos`;
        // Explicitly request the 'video' field to get the VOD video ID, which uses the same ID for comments
        const params = {
            fields: 'id,secure_stream_url,stream_url,video',
            access_token: pageToken
        }
        console.log(`[FB API] Request: POST ${url}`, { ...options, pageId });

        const response = await axios.post(url, {
            title: options.title,
            description: options.description,
            status: 'LIVE_NOW', // Or 'SCHEDULED'
            ...params
        });

        const vodVideoId = response.data.video?.id;
        console.log(`[FB API] Live Video Created: ID=${response.data.id}, VOD_ID=${vodVideoId}, StreamURL=${response.data.secure_stream_url ? '***' : 'N/A'}`);
        return {
            id: response.data.id,
            // If VOD ID is available, use IT for comments. If not, fallback to live ID.
            // But we need to store both potentially. For now, let's return it.
            video_id: vodVideoId,
            stream_url: response.data.secure_stream_url || response.data.stream_url,
        };
    }

    public async updateLiveVideo(liveVideoId: string, pageToken: string, options: { title?: string; description?: string }) {
        const url = `${GRAPH_API_BASE}/${liveVideoId}`;
        console.log(`[FB API] Request: POST (Update) ${url}`, options);
        const response = await axios.post(url, {
            ...options,
            access_token: pageToken,
        });

        console.log(`[FB API] Live Video Updated: ID=${liveVideoId}`);
        return response.data;
    }

    public async getLiveVideoViewers(liveVideoId: string, accessToken: string): Promise<number> {
        const url = `${GRAPH_API_BASE}/${liveVideoId}`;
        const params = {
            fields: 'live_views',
            access_token: accessToken,
        };
        const response = await axios.get(url, { params });
        return response.data.live_views || 0;
    }

    public async getLiveVideoStatus(liveVideoId: string, accessToken: string): Promise<string> {
        const url = `${GRAPH_API_BASE}/${liveVideoId}`;
        const params = {
            fields: 'status',
            access_token: accessToken,
        };
        const response = await axios.get(url, { params });
        return response.data.status;
    }

    public async postComment(liveVideoId: string, pageToken: string, message: string): Promise<string> {
        const url = `${GRAPH_API_BASE}/${liveVideoId}/comments`;
        console.log(`[FB API] Request: POST ${url}`, { message: message.substring(0, 20) + '...' });
        const response = await axios.post(url, {
            message,
            access_token: pageToken,
        });
        return response.data.id;
    }

    /**
     * Extracts a human-readable error from a Facebook Graph API AxelError
     */
    public static extractError(e: any): string {
        if (e.response?.data?.error) {
            const error = e.response.data.error;
            const msg = error.message;
            const code = error.code;
            const subcode = error.error_subcode;

            console.error(`[FB API ERROR] ${code}(${subcode}): ${msg}`);

            if (msg.includes('Session has expired')) return 'Your Facebook session has expired. Please provide a new User Access Token.';
            if (msg.includes('Error validating access token')) return 'Invalid Facebook access token. Please check your credentials.';
            if (code === 100) return `Facebook Validation Error: ${msg}`;
            if (code === 200) return `Facebook Permission Error: Ensure your token has 'publish_video' and 'pages_manage_posts' permissions.`;

            return `Facebook Error [${code}]: ${msg}`;
        }
        return e.message || 'An unknown Facebook error occurred.';
    }
}
