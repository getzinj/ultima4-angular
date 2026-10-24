import { VideoSwitches } from './video-switches';


function ultimaSwitches(): VideoSwitches {
  const video: VideoSwitches = new VideoSwitches();

  video.switch(0xC050);
  video.switch(0xC052);
  video.switch(0xC054);
  video.switch(0xC057);

  return video;
}


describe('VideoSwitches', (): void => {
  it('starts in text mode', (): void => {
    expect(new VideoSwitches().text).toBe(true);
  });

  it('shows full-screen hi-res after the switches the game sets', (): void => {
    expect(ultimaSwitches().fullScreenHires).toBe(true);
  });

  it('is not full screen in mixed mode', (): void => {
    const video: VideoSwitches = ultimaSwitches();

    video.switch(0xC053);

    expect(video.fullScreenHires).toBe(false);
  });

  it('selects page 2 at $C055', (): void => {
    const video: VideoSwitches = new VideoSwitches();

    video.switch(0xC055);

    expect(video.page2).toBe(true);
  });

  it('goes back to text at $C051', (): void => {
    const video: VideoSwitches = ultimaSwitches();

    video.switch(0xC051);

    expect(video.text).toBe(true);
  });
});
