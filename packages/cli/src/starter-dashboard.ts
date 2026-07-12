export const STARTER_DASHBOARD_NAME = "Web analytics starter";

const MODEL = "generated_view_events";
const TIME_DIMENSION = `${MODEL}._timestamp`;
const DATE_RANGE = ["-30d", "-0d"];

function counterOptions() {
  return {
    stacked: false,
    cumulative: false,
    data_range: "all",
    show_legend: true,
    display_type: "counter",
    show_as_percentage: false,
    show_uncategorized: false,
  };
}

/**
 * Starter chart definitions. The metric shapes mirror the payloads the
 * Usermaven trend library itself serves for its web-analytics templates.
 */
export function starterTrends(): Array<{
  name: string;
  payload: Record<string, unknown>;
}> {
  const timeDimensions = {
    dateRange: DATE_RANGE,
    dimension: TIME_DIMENSION,
    granularity: "day",
  };
  const comparedTimeDimensions = {
    ...timeDimensions,
    compare: { type: "previous_period" },
  };
  return [
    {
      name: "Visitors",
      payload: {
        name: "Visitors",
        description: "Unique visitors in the last 30 days",
        metrics: [
          {
            name: "Visitors",
            event: "event_type='pageview'",
            metric: "unique_visitor",
            filters: [],
            property: "",
            trendsType: "visitor",
          },
        ],
        dimensions: [],
        time_dimensions: comparedTimeDimensions,
        filters: [],
        model_name: MODEL,
        options: counterOptions(),
      },
    },
    {
      name: "Pageviews",
      payload: {
        name: "Pageviews",
        description: "Total page views in the last 30 days",
        metrics: [
          {
            name: "Pageviews",
            event: "event_type='pageview'",
            metric: "count",
            filters: [],
            property: "",
          },
        ],
        dimensions: [],
        time_dimensions: comparedTimeDimensions,
        filters: [],
        model_name: MODEL,
        options: counterOptions(),
      },
    },
    {
      name: "Sessions",
      payload: {
        name: "Sessions",
        description: "Sessions in the last 30 days",
        metrics: [
          {
            name: "Sessions",
            event: "event_type='pageview'",
            metric: "count_session",
            filters: [],
            property: "",
          },
        ],
        dimensions: [],
        time_dimensions: comparedTimeDimensions,
        filters: [],
        model_name: MODEL,
        options: counterOptions(),
      },
    },
    {
      name: "Visitors over time",
      payload: {
        name: "Visitors over time",
        description: "Daily unique visitors",
        metrics: [
          {
            name: "Visitors",
            event: "event_type='pageview'",
            metric: "unique_visitor",
            filters: [],
            property: "",
            trendsType: "visitor",
          },
        ],
        dimensions: [],
        time_dimensions: timeDimensions,
        filters: [],
        model_name: MODEL,
        options: { ...counterOptions(), display_type: "line" },
      },
    },
    {
      name: "Top pages",
      payload: {
        name: "Top pages",
        description: "Most visited pages by unique visitors",
        metrics: [
          {
            name: "Visitors",
            event: "event_type='pageview'",
            metric: "unique_visitor",
            filters: [],
            property: "",
            trendsType: "visitor",
          },
        ],
        dimensions: [`${MODEL}.doc_path`],
        time_dimensions: timeDimensions,
        filters: [],
        model_name: MODEL,
        options: {
          ...counterOptions(),
          display_type: "table",
          data_range: "top_25",
        },
      },
    },
  ];
}
