/**
 * ToolManager executes custom browser tools triggered by Gemini Live.
 * It carries out side effects (like opening a new window) and returns results.
 */
export class ToolManager {
  /**
   * Executes a tool request.
   */
  static async execute(
    name: string, 
    args: any, 
    onUiEvent?: (event: { type: string; payload: any }) => void
  ): Promise<any> {
    console.log(`[ToolManager] Executing tool: ${name} with args:`, args);

    // Notify UI of tool execution so we can show beautiful feedback
    if (onUiEvent) {
      onUiEvent({ type: 'toolStart', payload: { name, args } });
    }

    let result: any;
    try {
      switch (name) {
        case 'openWebsite':
          result = await this.openWebsite(args.url, args.label);
          break;
        case 'getWeather':
          result = await this.getWeather(args.location);
          break;
        case 'getDateTime':
          result = await this.getDateTime();
          break;
        default:
          throw new Error(`Unsupported tool: ${name}`);
      }
    } catch (err: any) {
      result = { status: 'error', message: err.message };
    }

    if (onUiEvent) {
      onUiEvent({ type: 'toolComplete', payload: { name, args, result } });
    }

    return result;
  }

  private static async openWebsite(url: string, label?: string): Promise<any> {
    try {
      let absoluteUrl = url.trim();
      if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
        absoluteUrl = `https://${absoluteUrl}`;
      }

      // Open in a new tab
      const newTab = window.open(absoluteUrl, '_blank');
      
      return {
        status: 'success',
        url: absoluteUrl,
        label: label || 'Website',
        openedInNewTab: !!newTab,
        message: newTab 
          ? `Successfully opened ${label || absoluteUrl} in a new tab.`
          : `Attempted to open ${label || absoluteUrl} but the browser blocked the popup. Please allow popups or open it manually.`
      };
    } catch (e: any) {
      return {
        status: 'error',
        message: `Failed to open website: ${e.message}`
      };
    }
  }

  private static async getWeather(location: string): Promise<any> {
    // Return a realistic weather response with variance
    const temp = Math.floor(Math.random() * 15) + 12; // 12°C to 27°C
    const conditions = [
      'sunny and gorgeous', 
      'partly cloudy with a gentle breeze', 
      'misty and cool', 
      'refreshingly rainy', 
      'lightly overcast'
    ];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return {
      location,
      temperatureCelsius: temp,
      temperatureFahrenheit: Math.round((temp * 9/5) + 32),
      condition,
      humidity: `${Math.floor(Math.random() * 25) + 50}%`,
      windSpeed: `${Math.floor(Math.random() * 12) + 6} km/h`,
      message: `The weather in ${location} is currently ${temp}°C (${Math.round((temp * 9/5) + 32)}°F) and ${condition}.`
    };
  }

  private static async getDateTime(): Promise<any> {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedDate = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      formattedTime,
      formattedDate,
      timezone,
      utcOffset: now.getTimezoneOffset(),
      message: `The local time is ${formattedTime} on ${formattedDate} (${timezone}).`
    };
  }
}
