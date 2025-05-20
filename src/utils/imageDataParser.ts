export interface CMSImage {
  file: {
    url: string;
    details: {
      image: {
        width: number;
        height: number;
      };
    };
    contentType: string;
    color: string;
  };
}
