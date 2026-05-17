import { createAxios } from '@teable/openapi';

export const getAxios = () => {
  const axios = createAxios();
  axios.defaults.baseURL =
    process.env.BACKEND_INTERNAL_API_URL ?? `http://localhost:${process.env.PORT}/api`;
  return axios;
};

export const axios = getAxios();
