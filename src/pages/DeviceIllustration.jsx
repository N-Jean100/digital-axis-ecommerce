function DeviceIllustration() {
  return (
    <div className="device-scene" aria-hidden="true">
      <div className="device-orbit device-orbit-one" />
      <div className="device-orbit device-orbit-two" />
      <span className="device-spark device-spark-one">✳</span>
      <span className="device-spark device-spark-two">+</span>
      <div className="device-laptop-float">
        <div className="device-laptop">
          <div className="device-screen">
            <div className="device-screen-top"><span /><span /><span /></div>
            <div className="device-screen-title">Good morning</div>
            <div className="device-screen-subtitle">Your workspace at a glance</div>
            <div className="device-chart"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="device-screen-row"><span /><span /><span /></div>
          </div>
          <div className="device-laptop-base"><span /></div>
        </div>
      </div>
      <div className="device-phone-float">
        <div className="device-phone">
          <div className="device-phone-notch" />
          <div className="device-phone-header"><span>Good day</span><b>•••</b></div>
          <div className="device-phone-card"><small>ORDERS TODAY</small><strong>24</strong><i>↗ 12.8%</i></div>
          <div className="device-phone-list"><span /><span /><span /></div>
          <div className="device-phone-nav"><i /><i /><i /></div>
        </div>
      </div>
      <div className="device-note"><span>●</span> synced across devices</div>
    </div>
  );
}

export default DeviceIllustration;
